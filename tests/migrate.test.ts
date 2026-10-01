import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { listMigrationFiles, runMigrations } from "@/db/migrate";

/** Fake pg pool recording executed SQL; `schema_migrations` is simulated in memory. */
function fakePool(alreadyApplied: string[] = []) {
  const executed: string[] = [];
  const applied = new Set(alreadyApplied);
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      executed.push(sql.trim().split("\n")[0]);
      if (sql.startsWith("select name from schema_migrations")) {
        return { rows: [...applied].map((name) => ({ name })) };
      }
      if (sql.startsWith("insert into schema_migrations")) {
        applied.add(String(params?.[0]));
      }
      if (sql.includes("boom")) throw new Error("syntax error near boom");
      return { rows: [] };
    },
    release: () => {},
  };
  const pool = { connect: async () => client } as unknown as Pool;
  return { pool, executed, applied };
}

async function tempMigrations(files: Record<string, string>) {
  const dir = await mkdtemp(path.join(tmpdir(), "stag-migrations-"));
  for (const [name, sql] of Object.entries(files)) await writeFile(path.join(dir, name), sql);
  return dir;
}

describe("migration runner", () => {
  it("lists only NNNN_name.sql files in order", async () => {
    const dir = await tempMigrations({ "0002_b.sql": "", "0001_a.sql": "", "notes.txt": "", "x.sql": "" });
    expect(await listMigrationFiles(dir)).toEqual(["0001_a.sql", "0002_b.sql"]);
  });

  it("applies pending migrations in transactions and skips applied ones", async () => {
    const dir = await tempMigrations({ "0001_a.sql": "create table a()", "0002_b.sql": "create table b()" });
    const { pool, executed, applied } = fakePool(["0001_a.sql"]);
    const result = await runMigrations(pool, dir);
    expect(result).toEqual({ applied: ["0002_b.sql"], skipped: ["0001_a.sql"] });
    expect(executed).toEqual(expect.arrayContaining(["begin", "create table b()", "commit"]));
    expect(executed).not.toContain("create table a()");
    expect(applied.has("0002_b.sql")).toBe(true);
  });

  it("rolls back and reports the failing file", async () => {
    const dir = await tempMigrations({ "0001_bad.sql": "create table boom()" });
    const { pool, executed } = fakePool();
    await expect(runMigrations(pool, dir)).rejects.toThrow(/0001_bad.sql/);
    expect(executed).toContain("rollback");
  });
});
