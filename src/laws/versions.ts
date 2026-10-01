import type { PgVector } from "@mastra/pg";
import { archiveLawVersion, type Queryable } from "../db/repositories";
import type { ChunkMetadata } from "../sources/types";

/** ISO date one day before `isoDate`. */
export function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type VectorRowStore = Pick<PgVector, "query" | "upsert">;

/**
 * Marks the previous consolidated version of a law as superseded without
 * deleting anything: the law_versions row gets valid_to/is_current=false and
 * every vector of that version is rewritten with historical=true and validTo.
 * PgVector's updateVector REPLACES metadata, so each chunk's full metadata is
 * re-upserted together with its existing vector.
 */
export async function archivePreviousVersion(params: {
  db: Queryable;
  store: VectorRowStore;
  indexName: string;
  lawAbbrev: string;
  sourceId: string;
  previousVersionId: string;
  /** standDate of the NEW version; the old one is valid until the day before. */
  newStandDate: string | null;
  fallbackValidTo?: string;
}): Promise<{ archivedChunks: number; validTo: string }> {
  const validTo = params.newStandDate ? dayBefore(params.newStandDate) : (params.fallbackValidTo ?? new Date().toISOString().slice(0, 10));
  await archiveLawVersion(params.db, params.lawAbbrev, params.previousVersionId, validTo);

  const rows = await params.store.query({
    indexName: params.indexName,
    filter: { sourceId: params.sourceId, versionId: params.previousVersionId },
    topK: 10_000,
    includeVector: true,
  });

  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    await params.store.upsert({
      indexName: params.indexName,
      ids: batch.map((r) => r.id),
      vectors: batch.map((r) => r.vector ?? []),
      metadata: batch.map((r) => ({ ...(r.metadata as ChunkMetadata), historical: true, validTo })),
    });
  }
  return { archivedChunks: rows.length, validTo };
}
