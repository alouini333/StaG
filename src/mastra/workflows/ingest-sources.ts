import { randomUUID } from "node:crypto";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import {
  finishIngestionRun,
  getCurrentLawVersion,
  getSourceVersion,
  insertLawSections,
  insertLawVersion,
  startIngestionRun,
  upsertSourceVersion,
} from "../../db/repositories";
import { archivePreviousVersion } from "../../laws/versions";
import { embedDocuments } from "../../retrieval/embed";
import { chunkLaw } from "../../sources/chunkers/law-sections";
import { fetchGiiLaw } from "../../sources/fetchers/gii-xml";
import { decideIngestion } from "../../sources/ingest-decision";
import { parseGiiLaw } from "../../sources/parsers/gii-norm";
import { enabledSources, getSource } from "../../sources/registry";
import type { Chunk, SourceDefinition } from "../../sources/types";
import { vectorIndexName } from "../config/models";
import { ingestHtmlPages, ingestPdfs } from "./ingest-documents";
import { ingestionDeps } from "./ingestion-deps";

const triggerSchema = z.enum(["cli", "schedule", "api"]);

const sourceJobSchema = z.object({
  sourceId: z.string(),
  force: z.boolean(),
  trigger: triggerSchema,
  runId: z.string(),
  startedAt: z.string(),
});

const sourceResultSchema = z.object({
  id: z.string(),
  status: z.enum(["updated", "archived+updated", "skipped", "failed"]),
  reason: z.string().optional(),
  chunks: z.number().int().optional(),
  stand: z.string().nullable().optional(),
  versionId: z.string().nullable().optional(),
  error: z.string().optional(),
});
export type SourceIngestResult = z.infer<typeof sourceResultSchema>;

export const ingestInputSchema = z.object({
  sourceIds: z.array(z.string()).optional(),
  force: z.boolean().default(false),
  trigger: triggerSchema.default("cli"),
});

export const ingestSummarySchema = z.object({
  runId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  perSource: z.array(sourceResultSchema),
});
export type IngestSummary = z.infer<typeof ingestSummarySchema>;

const log = (message: string) => console.log(`[ingest] ${message}`);

// ------------------------------------------------------------------ steps

const resolveSources = createStep({
  id: "resolve-sources",
  description: "Expands the requested source ids into one job per enabled source and opens the ingestion run.",
  inputSchema: ingestInputSchema,
  outputSchema: z.array(sourceJobSchema),
  execute: async ({ inputData }) => {
    const sources = enabledSources(inputData.sourceIds);
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    await startIngestionRun(ingestionDeps().db, runId, inputData.trigger);
    log(`run ${runId}: ${sources.map((s) => s.id).join(", ") || "no sources"}${inputData.force ? " (force)" : ""}`);
    return sources.map((s) => ({ sourceId: s.id, force: inputData.force, trigger: inputData.trigger, runId, startedAt }));
  },
});

const ingestSource = createStep({
  id: "ingest-source",
  description: "Fetches, parses, chunks, embeds and stores one source; failures are isolated per source.",
  inputSchema: sourceJobSchema,
  outputSchema: sourceResultSchema,
  execute: async ({ inputData }) => {
    const source = getSource(inputData.sourceId);
    try {
      switch (source.kind) {
        case "gii-law":
          return await ingestGiiLaw(source, inputData.force);
        case "html-page":
          return await ingestHtmlPages(source, inputData.force);
        case "pdf":
          return await ingestPdfs(source, inputData.force);
        default:
          throw new Error(`Source kind "${source.kind}" is not implemented yet (steps 10–11)`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`${source.id}: FAILED – ${message}`);
      await upsertSourceVersion(ingestionDeps().db, { sourceId: source.id, status: "failed", error: message }).catch(() => {});
      return { id: source.id, status: "failed" as const, error: message };
    }
  },
});

const summarize = createStep({
  id: "summarize",
  description: "Closes the ingestion run with a per-source summary.",
  inputSchema: z.array(sourceResultSchema),
  outputSchema: ingestSummarySchema,
  execute: async ({ inputData, getStepResult }) => {
    const jobs = getStepResult(resolveSources) ?? [];
    const runId = jobs[0]?.runId ?? randomUUID();
    const startedAt = jobs[0]?.startedAt ?? new Date().toISOString();
    const summary: IngestSummary = { runId, startedAt, finishedAt: new Date().toISOString(), perSource: inputData };
    await finishIngestionRun(ingestionDeps().db, runId, summary).catch(() => {});
    return summary;
  },
});

export const ingestSources = createWorkflow({
  id: "ingestSources",
  description: "Fetches official sources, detects changes, chunks, embeds and upserts them into pgvector (archiving previous law versions).",
  inputSchema: ingestInputSchema,
  outputSchema: ingestSummarySchema,
})
  .then(resolveSources)
  .foreach(ingestSource)
  .then(summarize)
  .commit();

// ------------------------------------------------------------------ gii-law pipeline

async function ingestGiiLaw(source: Extract<SourceDefinition, { kind: "gii-law" }>, force: boolean): Promise<SourceIngestResult> {
  const { db, store } = ingestionDeps();
  const indexName = vectorIndexName();
  const stored = await getSourceVersion(db, source.id);

  const fetched = await fetchGiiLaw(source, { etag: stored?.etag, lastModified: stored?.lastModified, force });
  if (fetched.notModified) {
    await upsertSourceVersion(db, { sourceId: source.id, status: "skipped", lastCheckedAt: fetched.fetchedAt, pendingUpdate: false });
    log(`${source.id}: skipped (not modified)`);
    return { id: source.id, status: "skipped", reason: "not modified (304)", stand: stored?.stand, versionId: stored?.sourceVersion };
  }

  const decision = decideIngestion({
    force,
    notModified: false,
    storedHash: stored?.contentHash ?? null,
    newHash: fetched.contentHash,
    storedVersion: stored?.sourceVersion ?? null,
    newVersion: fetched.builddate,
  });
  if (decision.action === "skip") {
    await upsertSourceVersion(db, {
      sourceId: source.id,
      status: "skipped",
      lastCheckedAt: fetched.fetchedAt,
      etag: fetched.etag,
      lastModified: fetched.lastModified,
      pendingUpdate: false,
    });
    log(`${source.id}: skipped (${decision.reason})`);
    return { id: source.id, status: "skipped", reason: decision.reason, stand: stored?.stand, versionId: stored?.sourceVersion };
  }

  const parsed = parseGiiLaw(fetched.xml, { slug: source.options.slug, includeSections: source.options.includeSections });
  const versionId = fetched.builddate ?? fetched.contentHash.slice(0, 16);
  const chunks: Chunk[] = chunkLaw(parsed, { source, law: parsed.law, fetchedAt: fetched.fetchedAt, contentHash: fetched.contentHash, versionId });
  log(`${source.id}: ${parsed.sections.length} sections → ${chunks.length} chunks (${parsed.law.abbrev}, Stand: ${parsed.law.stand ?? "?"}); embedding…`);

  const vectors = await embedDocuments(
    chunks.map((c) => c.text),
    { onProgress: (done, total) => log(`${source.id}: embedded ${done}/${total}`)},
  );

  // Archive the previous consolidated version (never delete law text).
  let archived = 0;
  const current = await getCurrentLawVersion(db, parsed.law.abbrev);
  if (current && current.versionId !== versionId) {
    const result = await archivePreviousVersion({
      db,
      store,
      indexName,
      lawAbbrev: parsed.law.abbrev,
      sourceId: source.id,
      previousVersionId: current.versionId,
      newStandDate: parsed.law.standDate,
    });
    archived = result.archivedChunks;
    log(`${source.id}: archived version ${current.versionId} (${archived} chunks, valid until ${result.validTo})`);
  }

  await insertLawVersion(db, {
    lawAbbrev: parsed.law.abbrev,
    versionId,
    builddate: parsed.law.builddate,
    stand: parsed.law.stand,
    standDate: parsed.law.standDate,
    validFrom: parsed.law.standDate,
    validTo: null,
    isCurrent: true,
    sourceUrl: source.url,
  });
  await insertLawSections(
    db,
    parsed.sections.map((s) => ({
      lawAbbrev: parsed.law.abbrev,
      versionId,
      sectionKey: s.sectionKey,
      sectionRef: s.sectionRef,
      title: s.title,
      text: s.text,
      url: s.url,
      repealed: s.repealed,
    })),
  );

  for (let offset = 0; offset < chunks.length; offset += 100) {
    const batch = chunks.slice(offset, offset + 100);
    await store.upsert({
      indexName,
      ids: batch.map((c) => c.id),
      vectors: vectors.slice(offset, offset + batch.length),
      metadata: batch.map((c) => ({ ...c.metadata, text: c.text })),
    });
  }

  await upsertSourceVersion(db, {
    sourceId: source.id,
    sourceVersion: versionId,
    contentHash: fetched.contentHash,
    stand: parsed.law.stand,
    standDate: parsed.law.standDate,
    fetchedAt: fetched.fetchedAt,
    lastModified: fetched.lastModified,
    etag: fetched.etag,
    builddate: parsed.law.builddate,
    chunkCount: chunks.length,
    status: "updated",
    error: null,
    lastCheckedAt: fetched.fetchedAt,
    pendingUpdate: false,
    pendingReason: null,
  });

  log(`${source.id}: updated (${chunks.length} chunks, version ${versionId})`);
  return {
    id: source.id,
    status: archived > 0 ? "archived+updated" : "updated",
    reason: decision.reason,
    chunks: chunks.length,
    stand: parsed.law.stand,
    versionId,
  };
}
