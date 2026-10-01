import { createHash } from "node:crypto";
import { getSourceVersion, upsertSourceVersion } from "../../db/repositories";
import { embedDocuments } from "../../retrieval/embed";
import { chunkDocument } from "../../sources/chunkers/markdown";
import { fetchDocuments, type FetchedDocument } from "../../sources/fetchers/html-page";
import { decideIngestion } from "../../sources/ingest-decision";
import { htmlToMarkdown } from "../../sources/parsers/html-to-markdown";
import { pdfToText } from "../../sources/parsers/pdf-text";
import type { StandInfo } from "../../sources/parsers/stand";
import type { Chunk, SourceDefinition } from "../../sources/types";
import { vectorIndexName } from "../config/models";
import { ingestionDeps } from "./ingestion-deps";
import type { SourceIngestResult } from "./ingest-sources";

const log = (message: string) => console.log(`[ingest] ${message}`);

type ParsedDocument = { fetched: FetchedDocument; title: string; text: string; stand: StandInfo; sections?: Array<{ sectionRef: string; text: string }> };

/** Combined, order-independent hash of all documents of a source. */
export function combinedHash(documents: Array<{ url: string; contentHash: string }>): string {
  const h = createHash("sha256");
  for (const d of [...documents].sort((a, b) => a.url.localeCompare(b.url))) h.update(`${d.url}\n${d.contentHash}\n`);
  return h.digest("hex");
}

/** Newest as-of date across the documents (used as the source's Stand). */
function latestStand(docs: ParsedDocument[]): StandInfo | null {
  return docs.map((d) => d.stand).sort((a, b) => (b.standDate ?? "").localeCompare(a.standDate ?? ""))[0] ?? null;
}

/**
 * Shared tail of the html/pdf pipelines: embed, replace this source's vectors
 * (delete by sourceId filter, then upsert), record the version.
 */
async function replaceSourceChunks(source: SourceDefinition, chunks: Chunk[], versionHash: string, docs: ParsedDocument[], warnings: string[]): Promise<void> {
  const { db, store } = ingestionDeps();
  const indexName = vectorIndexName();
  const vectors = await embedDocuments(
    chunks.map((c) => c.text),
    { onProgress: (done, total) => log(`${source.id}: embedded ${done}/${total}`)},
  );
  await store.deleteVectors({ indexName, filter: { sourceId: source.id } });
  for (let offset = 0; offset < chunks.length; offset += 100) {
    const batch = chunks.slice(offset, offset + 100);
    await store.upsert({ indexName, ids: batch.map((c) => c.id), vectors: vectors.slice(offset, offset + batch.length), metadata: batch.map((c) => ({ ...c.metadata, text: c.text })) });
  }
  const stand = latestStand(docs);
  const fetchedAt = docs.map((d) => d.fetched.fetchedAt).sort().at(-1) ?? new Date().toISOString();
  await upsertSourceVersion(db, {
    sourceId: source.id,
    sourceVersion: versionHash.slice(0, 16),
    contentHash: versionHash,
    stand: stand?.stand ?? null,
    standDate: stand?.standDate ?? null,
    fetchedAt,
    lastModified: docs.map((d) => d.fetched.lastModified).find(Boolean) ?? null,
    etag: null,
    builddate: null,
    chunkCount: chunks.length,
    status: "updated",
    error: warnings.length ? warnings.join(" | ") : null,
    lastCheckedAt: fetchedAt,
    pendingUpdate: false,
    pendingReason: null,
  });
}

async function skipUnchanged(source: SourceDefinition, reason: string, stand: string | null | undefined, version: string | null | undefined): Promise<SourceIngestResult> {
  const now = new Date().toISOString();
  await upsertSourceVersion(ingestionDeps().db, { sourceId: source.id, status: "skipped", lastCheckedAt: now, pendingUpdate: false });
  log(`${source.id}: skipped (${reason})`);
  return { id: source.id, status: "skipped", reason, stand, versionId: version };
}

export async function ingestHtmlPages(source: Extract<SourceDefinition, { kind: "html-page" }>, force: boolean): Promise<SourceIngestResult> {
  const stored = await getSourceVersion(ingestionDeps().db, source.id);
  const { documents, errors } = await fetchDocuments(source, "html");
  if (documents.length === 0) throw new Error(`no page could be fetched: ${errors.join("; ")}`);
  for (const e of errors) log(`${source.id}: WARN ${e}`);

  const versionHash = combinedHash(documents);
  const decision = decideIngestion({ force, notModified: false, storedHash: stored?.contentHash ?? null, newHash: versionHash });
  if (decision.action === "skip") return skipUnchanged(source, decision.reason, stored?.stand, stored?.sourceVersion);

  const docs: ParsedDocument[] = documents.map((fetched) => {
    const page = htmlToMarkdown(fetched.body.toString("utf8"), {
      url: fetched.url,
      contentSelector: source.options.contentSelector,
      lastModified: fetched.lastModified,
      fetchedAt: fetched.fetchedAt,
    });
    return { fetched, title: page.title, text: page.markdown, stand: page.stand };
  });
  return finishDocuments(source, docs, versionHash, errors, decision.reason);
}

export async function ingestPdfs(source: Extract<SourceDefinition, { kind: "pdf" }>, force: boolean): Promise<SourceIngestResult> {
  const stored = await getSourceVersion(ingestionDeps().db, source.id);
  const { documents, errors } = await fetchDocuments(source, "pdf");
  if (documents.length === 0) throw new Error(`no PDF could be fetched: ${errors.join("; ")}`);
  for (const e of errors) log(`${source.id}: WARN ${e}`);

  const versionHash = combinedHash(documents);
  const decision = decideIngestion({ force, notModified: false, storedHash: stored?.contentHash ?? null, newHash: versionHash });
  if (decision.action === "skip") return skipUnchanged(source, decision.reason, stored?.stand, stored?.sourceVersion);

  const docs: ParsedDocument[] = [];
  for (const fetched of documents) {
    const parsed = await pdfToText(fetched.body, {
      url: fetched.url,
      title: source.options.urls.length > 1 ? `${source.title} – ${decodeURIComponent(fetched.url.split("/").pop()?.split("?")[0] ?? "")}` : source.title,
      standOverride: source.options.standOverride,
      lastModified: fetched.lastModified,
      fetchedAt: fetched.fetchedAt,
      sectionNumbering: source.options.sectionNumbering,
    });
    log(`${source.id}: ${parsed.pages} pages, ${parsed.text.length} chars${parsed.sections ? `, ${parsed.sections.length} numbered sections` : ""} (${parsed.stand.stand})`);
    docs.push({ fetched, title: parsed.title, text: parsed.text, stand: parsed.stand, sections: parsed.sections });
  }
  return finishDocuments(source, docs, versionHash, errors, decision.reason);
}

async function finishDocuments(source: SourceDefinition, docs: ParsedDocument[], versionHash: string, warnings: string[], reason: string): Promise<SourceIngestResult> {
  const chunks: Chunk[] = [];
  let index = 0;
  for (const doc of docs) {
    if (!doc.text.trim() && !doc.sections) {
      warnings.push(`${doc.fetched.url}: empty content`);
      continue;
    }
    const result = chunkDocument({
      source,
      fetched: doc.fetched,
      title: doc.title,
      stand: doc.stand,
      text: doc.text,
      sections: doc.sections,
      publisher: source.publisher ?? source.title,
      sourceVersion: versionHash.slice(0, 16),
      startIndex: index,
    });
    chunks.push(...result.chunks);
    index = result.nextIndex;
  }
  if (chunks.length === 0) throw new Error("no content extracted from any document");
  log(`${source.id}: ${docs.length} documents → ${chunks.length} chunks; embedding…`);
  await replaceSourceChunks(source, chunks, versionHash, docs, warnings);
  const stand = latestStand(docs);
  log(`${source.id}: updated (${chunks.length} chunks)`);
  return { id: source.id, status: "updated", reason, chunks: chunks.length, stand: stand?.stand ?? null, versionId: versionHash.slice(0, 16) };
}
