import { describe, expect, it } from "vitest";
import { archivePreviousVersion, dayBefore } from "@/laws/versions";

describe("dayBefore", () => {
  it("handles month and year boundaries", () => {
    expect(dayBefore("2025-10-30")).toBe("2025-10-29");
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
    expect(dayBefore("2024-03-01")).toBe("2024-02-29");
  });
});

describe("archivePreviousVersion", () => {
  it("marks the version and rewrites every chunk's metadata keeping its vector", async () => {
    const sql: string[] = [];
    const db = { query: async (text: string) => (sql.push(text), { rows: [], rowCount: 1 }) } as never;
    const upserts: unknown[] = [];
    const store = {
      query: async () => [
        { id: "stag::v1::0", score: 0, vector: [1, 2], metadata: { sourceId: "stag", versionId: "v1", chunkIndex: 0, historical: false, validTo: null } },
        { id: "stag::v1::1", score: 0, vector: [3, 4], metadata: { sourceId: "stag", versionId: "v1", chunkIndex: 1, historical: false, validTo: null } },
      ],
      upsert: async (args: unknown) => (upserts.push(args), []),
    } as never;

    const result = await archivePreviousVersion({
      db, store, indexName: "idx", lawAbbrev: "StAG", sourceId: "stag", previousVersionId: "v1", newStandDate: "2025-10-30",
    });

    expect(result).toEqual({ archivedChunks: 2, validTo: "2025-10-29" });
    expect(sql.some((s) => s.includes("update law_versions set is_current = false"))).toBe(true);
    const [upsert] = upserts as Array<{ ids: string[]; vectors: number[][]; metadata: Array<Record<string, unknown>> }>;
    expect(upsert.ids).toEqual(["stag::v1::0", "stag::v1::1"]);
    expect(upsert.vectors).toEqual([[1, 2], [3, 4]]);
    expect(upsert.metadata.every((m) => m.historical === true && m.validTo === "2025-10-29" && m.chunkIndex !== undefined)).toBe(true);
  });
});
