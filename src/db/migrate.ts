import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolClient } from "pg";

export const MIGRATIONS_DIR = path.join(process.cwd(), "src", "db", "migrations");

export type MigrationResult = { applied: string[]; skipped: string[] };

/** Minimal subset of pg's client API used by the runner (lets tests pass a fake). */
export type Queryable = Pick<PoolClient, "query">;

export async function listMigrationFiles(dir = MIGRATIONS_DIR): Promise<string[]> {
  const entries = await readdir(dir);
  return entries.filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
}

export async function appliedMigrations(client: Queryable): Promise<Set<string>> {
  await client.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const result = await client.query<{ name: string }>("select name from schema_migrations");
  return new Set(result.rows.map((row) => row.name));
}

/**
 * Applies every pending `NNNN_name.sql` file in order, each in its own
 * transaction, recording it in `schema_migrations`. Idempotent.
 */
export async function runMigrations(pool: Pool, dir = MIGRATIONS_DIR): Promise<MigrationResult> {
  const client = await pool.connect();
  try {
    const files = await listMigrationFiles(dir);
    const applied = await appliedMigrations(client);
    const result: MigrationResult = { applied: [], skipped: [] };

    for (const file of files) {
      if (applied.has(file)) {
        result.skipped.push(file);
        continue;
      }
      const sql = await readFile(path.join(dir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        result.applied.push(file);
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return result;
  } finally {
    client.release();
  }
}
