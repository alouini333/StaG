import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { env } from "../env";
import { poolConfigFor, type PoolKind } from "./pool-config";

const pools: Partial<Record<PoolKind, Pool>> = {};

export function connectionStringFor(kind: PoolKind): string {
  if (kind === "runtime") return env.DATABASE_URL;
  if (!env.DATABASE_URL_SESSION) {
    throw new Error(
      "DATABASE_URL_SESSION is required for scripts (migrations, ingestion): the Supabase session pooler URL on port 5432.",
    );
  }
  return env.DATABASE_URL_SESSION;
}

/**
 * Module-scope pool singletons. The `runtime` pool is used by the web app and
 * the Mastra instance; `session` by CLI scripts. On Vercel the runtime pool is
 * registered with Fluid compute so idle connections are closed after requests.
 */
export function getPool(kind: PoolKind): Pool {
  const existing = pools[kind];
  if (existing) return existing;

  const pool = new Pool(poolConfigFor(kind, connectionStringFor(kind)));
  pool.on("error", (error) => {
    console.error(`[db] idle client error (${kind} pool)`, error);
  });
  if (kind === "runtime" && process.env.VERCEL) {
    attachDatabasePool(pool);
  }
  pools[kind] = pool;
  return pool;
}

export async function closePools(): Promise<void> {
  await Promise.all(
    (Object.keys(pools) as PoolKind[]).map(async (kind) => {
      const pool = pools[kind];
      delete pools[kind];
      await pool?.end();
    }),
  );
}
