import { PgVector } from "@mastra/pg";
import { attachDatabasePool } from "@vercel/functions";
import { env } from "../env";
import { EMBEDDING_DIMENSIONS, vectorIndexName } from "../mastra/config/models";
import { connectionStringFor } from "../db/pool";
import { poolConfigFor, type PoolKind } from "../db/pool-config";

const stores: Partial<Record<PoolKind, PgVector>> = {};

/**
 * PgVector cannot share an external pg.Pool, so it owns a second small pool.
 * `runtime` (transaction pooler) serves the web app; `session` serves scripts.
 */
export function createVectorStore(kind: PoolKind): PgVector {
  const existing = stores[kind];
  if (existing) return existing;

  const connectionString = connectionStringFor(kind);
  const { connectionString: _omit, ...poolOptions } = poolConfigFor(kind, connectionString);
  void _omit;
  const store = new PgVector({
    id: `citizenship-vectors-${kind}`,
    connectionString,
    disableInit: env.MASTRA_DISABLE_STORAGE_INIT,
    pgPoolOptions: poolOptions,
  });
  if (kind === "runtime" && process.env.VERCEL) {
    attachDatabasePool(store.pool);
  }
  stores[kind] = store;
  return store;
}

/** Creates the HNSW cosine index for the current embedding model/dims if missing. */
export async function ensureVectorIndex(store: PgVector): Promise<string> {
  const indexName = vectorIndexName();
  await store.createIndex({
    indexName,
    dimension: EMBEDDING_DIMENSIONS,
    metric: "cosine",
    indexConfig: { type: "hnsw", hnsw: { m: 16, efConstruction: 64 } },
    metadataIndexes: ["tier", "sourceId", "historical"],
  });
  return indexName;
}
