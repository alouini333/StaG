/**
 * One-time (idempotent) database initialisation via the session pooler:
 * migrations → Mastra storage schema → pgvector index for the current embedding
 * model. Run locally or in CI; the web app runs with MASTRA_DISABLE_STORAGE_INIT=true.
 * Usage: pnpm db:init
 */
import "dotenv/config";
import { PostgresStore } from "@mastra/pg";
import { closePools, getPool } from "../src/db/pool";
import { describeConnection } from "../src/db/pool-config";
import { runMigrations } from "../src/db/migrate";
import { env } from "../src/env";
import { createVectorStore, ensureVectorIndex } from "../src/retrieval/vector-store";
import { EMBEDDING_DIMENSIONS, modelIds } from "../src/mastra/config/models";

async function main() {
  console.log(`[db-init] database: ${describeConnection(env.DATABASE_URL_SESSION)}`);

  const migrations = await runMigrations(getPool("session"));
  console.log(`[db-init] migrations applied: ${migrations.applied.join(", ") || "none"} (skipped ${migrations.skipped.length})`);

  const storage = new PostgresStore({ id: "stag-storage-init", pool: getPool("session"), disableInit: false });
  await storage.init();
  console.log("[db-init] Mastra storage schema ready");

  const vectors = new (await import("@mastra/pg")).PgVector({
    id: "citizenship-vectors-init",
    connectionString: env.DATABASE_URL_SESSION,
    disableInit: false,
    pgPoolOptions: { max: 2 },
  });
  const indexName = await ensureVectorIndex(vectors);
  const stats = await vectors.describeIndex({ indexName });
  console.log(`[db-init] vector index ${indexName}: ${JSON.stringify(stats)} (model ${modelIds.embedding}, ${EMBEDDING_DIMENSIONS} dims)`);
  console.log(`[db-init] all indexes: ${(await vectors.listIndexes()).join(", ")}`);
  await vectors.disconnect();
  void createVectorStore;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closePools());
