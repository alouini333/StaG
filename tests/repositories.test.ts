import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  archiveLawVersion,
  countLawSections,
  finishIngestionRun,
  getCachedCommunity,
  getCurrentLawVersion,
  getLawSection,
  getLawVersionAsOf,
  getLastIngestionRun,
  getSourceVersion,
  insertLawSections,
  insertLawVersion,
  insertLegislationAlert,
  listLawChanges,
  listLegislationAlerts,
  markSourcePending,
  purgeExpiredCommunity,
  setCachedCommunity,
  startIngestionRun,
  upsertLawChange,
  upsertSourceVersion,
} from "@/db/repositories";

/**
 * Integration test against a throwaway schema. Runs only when TEST_DATABASE_URL
 * is set (e.g. the local pgvector container); skipped otherwise.
 */
const url = process.env.TEST_DATABASE_URL;
const schema = `test_${Date.now().toString(36)}`;

describe.skipIf(!url)("repositories (integration)", () => {
  const pool = new Pool({ connectionString: url, max: 2 });
  let db: PoolClient;

  beforeAll(async () => {
    db = await pool.connect();
    await db.query(`create schema ${schema}`);
    await db.query(`set search_path to ${schema}`);
    for (const file of ["0002_sources.sql", "0003_laws.sql", "0004_ops.sql"]) {
      await db.query(await readFile(path.join(process.cwd(), "src/db/migrations", file), "utf8"));
    }
  });

  afterAll(async () => {
    await db.query(`drop schema ${schema} cascade`);
    db.release();
    await pool.end();
  });

  it("upserts source versions without clobbering unspecified fields", async () => {
    await upsertSourceVersion(db, { sourceId: "stag", sourceVersion: "v1", stand: "Stand A", chunkCount: 10, status: "updated" });
    await upsertSourceVersion(db, { sourceId: "stag", status: "skipped" });
    const v = await getSourceVersion(db, "stag");
    expect(v?.sourceVersion).toBe("v1");
    expect(v?.chunkCount).toBe(10);
    expect(v?.status).toBe("skipped");
    await markSourcePending(db, "stag", true, "xml.zip Last-Modified changed");
    expect((await getSourceVersion(db, "stag"))?.pendingUpdate).toBe(true);
  });

  it("archives law versions and resolves sections by current version or as-of date", async () => {
    await insertLawVersion(db, { lawAbbrev: "StAG", versionId: "v1", builddate: "1", stand: "A", standDate: "2024-06-27", validFrom: "2024-06-27", validTo: null, sourceUrl: null });
    await insertLawSections(db, [
      { lawAbbrev: "StAG", versionId: "v1", sectionKey: "10", sectionRef: "§ 10 StAG", title: null, text: "(3) drei Jahre", url: null, repealed: false },
    ]);
    await archiveLawVersion(db, "StAG", "v1", "2025-10-29");
    await insertLawVersion(db, { lawAbbrev: "StAG", versionId: "v2", builddate: "2", stand: "B", standDate: "2025-10-30", validFrom: "2025-10-30", validTo: null, sourceUrl: null });
    await insertLawSections(db, [
      { lawAbbrev: "StAG", versionId: "v2", sectionKey: "10", sectionRef: "§ 10 StAG", title: null, text: "(3) (weggefallen)", url: null, repealed: false },
    ]);

    expect((await getCurrentLawVersion(db, "StAG"))?.versionId).toBe("v2");
    expect((await getLawSection(db, "StAG", "10"))?.text).toBe("(3) (weggefallen)");
    expect((await getLawSection(db, "StAG", "10", "v1"))?.text).toBe("(3) drei Jahre");
    expect((await getLawVersionAsOf(db, "StAG", "2025-01-15"))?.versionId).toBe("v1");
    expect((await getLawVersionAsOf(db, "StAG", "2026-01-15"))?.versionId).toBe("v2");
    expect(await countLawSections(db, "StAG", "v1")).toBe(1);
  });

  it("stores law changes, ingestion runs, alerts and the community cache", async () => {
    await upsertLawChange(db, { id: "stag-2025-10-30-10-3", lawAbbrev: "StAG", sectionRef: "§ 10 Abs. 3 StAG", inForceDate: "2025-10-30", bgblRef: "BGBl. 2025 I Nr. 256", bgblUrl: null, summaryDe: "aufgehoben", summaryEn: "repealed", oldText: null, newText: null, origin: "seed" });
    expect((await listLawChanges(db, "StAG", "§ 10 Abs. 3 StAG"))[0]?.summaryEn).toBe("repealed");

    await startIngestionRun(db, "run1", "cli");
    await finishIngestionRun(db, "run1", { ok: true });
    expect((await getLastIngestionRun(db))?.summary).toEqual({ ok: true });

    expect(await insertLegislationAlert(db, { id: "bgbl-2026-273", source: "bgbl-rss", title: "BGBl. 2026 I Nr. 273", url: null, classification: "relevant", reason: "mentions StAG" })).toBe(true);
    expect(await insertLegislationAlert(db, { id: "bgbl-2026-273", source: "bgbl-rss", title: "dup", url: null, classification: null, reason: null })).toBe(false);
    expect((await listLegislationAlerts(db, "new")).length).toBe(1);

    await setCachedCommunity(db, "q1", { hits: 2 });
    expect(await getCachedCommunity<{ hits: number }>(db, "q1", 60_000)).toEqual({ hits: 2 });
    expect(await getCachedCommunity(db, "q1", 0)).toBeNull();
    expect(await purgeExpiredCommunity(db, 0)).toBe(1);
  });
});
