import type { PgVector } from "@mastra/pg";
import type { Pool } from "pg";
import { getPool } from "../../db/pool";
import { env } from "../../env";
import { createVectorStore } from "../../retrieval/vector-store";

export type IngestionDeps = { db: Pool; store: PgVector; kind: "session" | "runtime" };

/**
 * Ingestion prefers the session pooler (long transactions, IPv4) and falls back
 * to the runtime pool when only DATABASE_URL is configured (e.g. Studio on a
 * machine without the session URL).
 */
export function ingestionDeps(): IngestionDeps {
  const kind = env.DATABASE_URL_SESSION ? "session" : "runtime";
  return { db: getPool(kind), store: createVectorStore(kind), kind };
}
