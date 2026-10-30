import type { Pool } from "pg";
import type { PgVector } from "@mastra/pg";
import { createCommunityProvider, type CommunityProvider } from "../community/provider";
import { getPool } from "../db/pool";
import { getLastIngestionRun, getLawSection, listLawVersions, listSourceVersions, type Queryable } from "../db/repositories";
import { env } from "../env";
import { vectorIndexName } from "../mastra/config/models";
import type { ChunkMetadata } from "../sources/types";
import { embedQuery } from "./embed";
import {
  assessCoverage,
  assignCitationIds,
  citedProvisions,
  dedupeBySection,
  flagOutdated,
  orderOfficial,
  RETRIEVAL,
  shouldIncludeCommunity,
  type CitedResult,
  type Coverage,
  type Intent,
  type RetrievedChunk,
} from "./hierarchy";
import { extractParagraph } from "./statute";
import { createVectorStore } from "./vector-store";

export type SearchInput = {
  queryDe: string;
  queryEn: string;
  intent: Intent;
  /** ISO date when the question concerns a past event (Step 10 adds the version filter). */
  asOfDate?: string;
  k?: number;
  lang?: "de" | "en";
};

export type IndexStatus = {
  lastIngestedAt: string | null;
  indexAgeDays: number | null;
  stale: boolean;
  laws: Array<{ lawAbbrev: string; stand: string | null; standDate: string | null }>;
  pendingSources: string[];
};

export type SearchOutput = {
  official: CitedResult[];
  community: CitedResult[];
  communityIncluded: boolean;
  communityReason: string;
  communityProvider: CommunityProvider["id"];
  communityError?: string;
  coverage: Coverage;
  indexStatus: IndexStatus;
};

export type VectorQueryStore = Pick<PgVector, "query">;

export type SearchDeps = {
  store: VectorQueryStore;
  db: Queryable;
  embed: (text: string) => Promise<number[]>;
  community: CommunityProvider;
  indexName: string;
  now?: () => Date;
};

export function defaultSearchDeps(): SearchDeps {
  return {
    store: createVectorStore("runtime"),
    db: getPool("runtime") as Pool,
    embed: embedQuery,
    community: createCommunityProvider(env.COMMUNITY_PROVIDER),
    indexName: vectorIndexName(),
  };
}

export async function getIndexStatus(db: Queryable, now = new Date()): Promise<IndexStatus> {
  const [run, laws, sources] = await Promise.all([getLastIngestionRun(db), listLawVersions(db), listSourceVersions(db)]);
  const lastIngestedAt = sources.map((s) => s.fetchedAt).filter((v): v is string => !!v).sort().at(-1) ?? run?.finishedAt ?? null;
  const indexAgeDays = lastIngestedAt ? Math.floor((now.getTime() - new Date(lastIngestedAt).getTime()) / 86_400_000) : null;
  return {
    lastIngestedAt,
    indexAgeDays,
    stale: indexAgeDays === null || indexAgeDays > env.STALE_AFTER_DAYS,
    laws: laws.filter((l) => l.isCurrent).map((l) => ({ lawAbbrev: l.lawAbbrev, stand: l.stand, standDate: l.standDate })),
    pendingSources: sources.filter((s) => s.pendingUpdate).map((s) => s.sourceId),
  };
}

/**
 * A long § is split into several chunks; a retrieved "§ 10 Abs. 1" chunk alone
 * hides that "(3) (weggefallen)" exists further down. Append a one-line outline
 * of all Absätze (repealed ones marked) so the model sees the whole section.
 */
export function sectionOutline(sectionRef: string, text: string): string {
  const parts = text.split(/\n\n(?=\(\d+[a-z]?\)\s)/).filter((p) => /^\(\d+[a-z]?\)\s/.test(p));
  if (parts.length < 2) return "";
  const items = parts.map((p) => {
    const n = p.match(/^\((\d+[a-z]?)\)/)?.[1] ?? "?";
    if (/^\(\d+[a-z]?\)\s*\(weggefallen\)/i.test(p)) return `(${n}) (weggefallen – aufgehoben)`;
    const body = p.replace(/^\(\d+[a-z]?\)\s*/, "").replace(/\s+/g, " ");
    return `(${n}) ${body.slice(0, 70)}${body.length > 70 ? "…" : ""}`;
  });
  return `Übersicht aller Absätze von ${sectionRef}: ${items.join(" | ")}`;
}

async function appendSectionOutlines(db: Queryable, results: Array<RetrievedChunk & { possiblyOutdated: boolean }>): Promise<void> {
  const done = new Set<string>();
  for (const r of results) {
    const m = r.metadata.tier === 1 && r.metadata.lawAbbrev ? r.metadata.sectionRef?.match(/^(§ (\d+[a-z]?)) Abs\. \d+[a-z]?/) : null;
    if (!m) continue;
    const key = `${r.metadata.lawAbbrev}|${m[2]}`;
    if (done.has(key)) continue;
    done.add(key);
    const section = await getLawSection(db, r.metadata.lawAbbrev!, m[2].toLowerCase()).catch(() => null);
    if (!section) continue;
    const outline = sectionOutline(`${m[1]} ${r.metadata.lawAbbrev}`, section.text);
    if (!outline) continue;
    // Insert after the header line: excerpts are truncated, so the outline must come first.
    const nl = r.text.indexOf("\n");
    r.text = nl > 0 ? `${r.text.slice(0, nl)}\n${outline}\n${r.text.slice(nl)}` : `${outline}\n\n${r.text}`;
  }
}

async function linkedLawChunks(db: Queryable, results: RetrievedChunk[], status: IndexStatus): Promise<RetrievedChunk[]> {
  const present = new Set(results.filter((r) => r.metadata.tier === 1).map((r) => `${r.metadata.lawAbbrev}|${(r.metadata.sectionRef ?? "").replace(/\s?Abs\.\s?\d+[a-z]?/, "")}`));
  const extra: RetrievedChunk[] = [];
  for (const ref of citedProvisions(results)) {
    const section = await getLawSection(db, ref.lawAbbrev, ref.sectionKey).catch(() => null);
    if (!section) continue;
    const key = `${ref.lawAbbrev}|${section.sectionRef}`;
    if (present.has(key) && ref.paragraph === null) continue;
    const paragraph = ref.paragraph !== null ? extractParagraph(section.text, ref.paragraph) : null;
    const law = status.laws.find((l) => l.lawAbbrev === ref.lawAbbrev);
    const sectionRef = paragraph ? section.sectionRef.replace(/^(§ \d+[a-z]?|Art\. \d+[a-z]?)/, (m) => `${m} Abs. ${ref.paragraph}`) : section.sectionRef;
    extra.push({
      id: `linked:${ref.lawAbbrev}:${ref.sectionKey}:${ref.paragraph ?? "all"}`,
      score: 0.99,
      text: `${ref.lawAbbrev} ${sectionRef.replace(` ${ref.lawAbbrev}`, "")} (Stand: ${law?.stand ?? "?"}) — aktueller Gesetzestext zu der in "${ref.from}" genannten Vorschrift:\n\n${paragraph ?? section.text}`,
      linkedFrom: ref.from,
      metadata: {
        sourceId: `law-${ref.lawAbbrev.toLowerCase()}`,
        tier: 1,
        kind: "gii-law",
        title: `${ref.lawAbbrev} (aktuelle Fassung)`,
        url: section.url ?? "https://www.gesetze-im-internet.de/",
        lang: "de",
        jurisdictionScope: "federal",
        sectionRef,
        lawAbbrev: ref.lawAbbrev,
        stand: law?.stand ?? undefined,
        standDate: law?.standDate ?? undefined,
        fetchedAt: status.lastIngestedAt ?? new Date().toISOString(),
        sourceVersion: section.versionId,
        contentHash: "linked",
        chunkIndex: 0,
        versionId: section.versionId,
        historical: false,
      },
    });
  }
  return extra;
}

function toChunk(row: { id: string; score: number; metadata?: Record<string, unknown> }): RetrievedChunk | null {
  const metadata = row.metadata as (ChunkMetadata & { text?: string }) | undefined;
  if (!metadata || typeof metadata.text !== "string") return null;
  return { id: row.id, score: row.score, text: metadata.text, metadata };
}

/**
 * Hierarchical retrieval, enforced in code:
 * 1. official tiers 1–3 (current law versions) are always searched,
 * 2. ordered law → federal authority → Land/institution, capped per tier,
 * 3. tier 2–3 hits older than the governing law are flagged,
 * 4. tier 4 (community) is consulted only when the gating matrix says so,
 * 5. every result gets a citation id.
 */
export async function searchSources(input: SearchInput, deps: SearchDeps = defaultSearchDeps()): Promise<SearchOutput> {
  const lang = input.lang ?? "de";
  const vector = await deps.embed(input.queryDe || input.queryEn);
  const rows = await deps.store.query({
    indexName: deps.indexName,
    queryVector: vector,
    topK: RETRIEVAL.topKOfficial,
    minScore: RETRIEVAL.minScore,
    filter: { tier: { $in: [1, 2, 3] }, historical: false },
  });
  const retrieved = rows.map(toChunk).filter((r): r is RetrievedChunk => r !== null);
  const indexStatus = await getIndexStatus(deps.db, deps.now?.());
  const lawStandDates = Object.fromEntries(indexStatus.laws.map((l) => [l.lawAbbrev, l.standDate]));

  // Law always sits next to the pages that cite it: pull the current text of provisions
  // referenced in tier-2/3 excerpts (e.g. a FAQ still describing a repealed "§ 10 Abs. 3").
  const deduped = dedupeBySection(retrieved);
  const linked = await linkedLawChunks(deps.db, deduped, indexStatus);
  const official = flagOutdated(orderOfficial(dedupeBySection([...deduped, ...linked])), lawStandDates);
  await appendSectionOutlines(deps.db, official);
  const coverage = assessCoverage(official);
  const gate = shouldIncludeCommunity({ intent: input.intent, coverage });

  let community: Awaited<ReturnType<CommunityProvider["search"]>> = [];
  let communityError: string | undefined;
  if (gate.include && deps.community.id !== "none") {
    try {
      community = await deps.community.search({ queryEn: input.queryEn || input.queryDe, queryDe: input.queryDe, k: input.k ?? RETRIEVAL.communityK });
    } catch (error) {
      communityError = error instanceof Error ? error.message : String(error);
    }
  }

  const cited = assignCitationIds(official, community, lang);
  return {
    official: cited.official,
    community: cited.community,
    communityIncluded: gate.include,
    communityReason: gate.reason,
    communityProvider: deps.community.id,
    communityError,
    coverage,
    indexStatus,
  };
}
