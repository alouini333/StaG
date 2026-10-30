import { describe, expect, it, vi } from "vitest";
import type { CommunityProvider } from "@/community/provider";
import { searchSources, type SearchDeps } from "@/retrieval/search";

const row = (id: string, tier: 1 | 2 | 3, score: number, standDate: string, text = `content ${id}`) => ({
  id,
  score,
  metadata: {
    sourceId: `src-${tier}`,
    tier,
    kind: tier === 1 ? "gii-law" : "html-page",
    title: `Title ${tier}`,
    url: `https://example.org/${id}`,
    lang: "de",
    jurisdictionScope: tier === 3 ? "Berlin" : "federal",
    fetchedAt: "2026-10-01T00:00:00.000Z",
    sourceVersion: "v",
    contentHash: "h",
    chunkIndex: 0,
    historical: false,
    standDate,
    ...(tier === 1 ? { sectionRef: `§ ${id} StAG`, lawAbbrev: "StAG" } : {}),
    text,
  },
});

function deps(rows: ReturnType<typeof row>[], provider: CommunityProvider): SearchDeps & { queries: unknown[] } {
  const queries: unknown[] = [];
  const db = {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes("from law_versions")) return { rows: [{ law_abbrev: "StAG", version_id: "v2", builddate: null, stand: "Stand", stand_date: "2026-07-21", valid_from: "2026-07-21", valid_to: null, is_current: true, source_url: null, archived_at: null }], rowCount: 1 };
      if (sql.includes("from law_sections")) {
        if (params?.[1] !== "10") return { rows: [], rowCount: 0 };
        return { rows: [{ law_abbrev: "StAG", version_id: "v2", section_key: "10", section_ref: "§ 10 StAG", title: null, text: "(1) Fünf Jahre …\n\n(3) (weggefallen)", url: "https://www.gesetze-im-internet.de/stag/__10.html", repealed: false }], rowCount: 1 };
      }
      if (sql.includes("from source_versions")) return { rows: [{ source_id: "stag", source_version: "v2", content_hash: "h", stand: "Stand", stand_date: "2026-07-21", fetched_at: "2026-10-01T06:00:00.000Z", last_modified: null, etag: null, builddate: null, chunk_count: 57, status: "updated", error: null, last_checked_at: null, pending_update: false, pending_reason: null }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  return {
    queries,
    store: { query: async (args: unknown) => (queries.push(args), rows) } as never,
    db: db as never,
    embed: async () => [0.1, 0.2],
    community: provider,
    indexName: "idx",
    now: () => new Date("2026-10-02T00:00:00.000Z"),
  };
}

const spyProvider = (id: "notes" | "none" = "notes"): CommunityProvider & { search: ReturnType<typeof vi.fn> } => ({
  id,
  search: vi.fn(async () => []),
});

describe("searchSources", () => {
  it("does not consult community for a legal question with strong coverage", async () => {
    const provider = spyProvider();
    const result = await searchSources({ queryDe: "q", queryEn: "q", intent: "legal" }, deps([row("10", 1, 0.75, "2026-07-21"), row("9", 1, 0.66, "2026-07-21")], provider));
    expect(result.coverage).toBe("strong");
    expect(result.communityIncluded).toBe(false);
    expect(provider.search).not.toHaveBeenCalled();
    expect(result.official.map((r) => r.citationId)).toEqual(["S1", "S2"]);
  });

  it("consults community for experience questions and flags outdated pages", async () => {
    const provider = spyProvider();
    const result = await searchSources({ queryDe: "q", queryEn: "how long did it take", intent: "experience" }, deps([row("10", 1, 0.7, "2026-07-21"), row("faq", 2, 0.68, "2025-05-01")], provider));
    expect(result.communityIncluded).toBe(true);
    expect(provider.search).toHaveBeenCalledWith(expect.objectContaining({ queryEn: "how long did it take" }));
    expect(result.official.find((r) => r.tier === 2)?.possiblyOutdated).toBe(true);
    expect(result.official.find((r) => r.tier === 1)?.possiblyOutdated).toBe(false);
  });

  it("queries only current official tiers and reports index status", async () => {
    const d = deps([row("10", 1, 0.7, "2026-07-21")], spyProvider("none"));
    const result = await searchSources({ queryDe: "q", queryEn: "q", intent: "mixed" }, d);
    expect(d.queries[0]).toMatchObject({ filter: { tier: { $in: [1, 2, 3] }, historical: false } });
    expect(result.indexStatus).toMatchObject({ lastIngestedAt: "2026-10-01T06:00:00.000Z", indexAgeDays: 0, stale: false });
    expect(result.indexStatus.laws[0]).toMatchObject({ lawAbbrev: "StAG", standDate: "2026-07-21" });
  });

  it("injects the current law text for provisions cited by authority pages", async () => {
    const faq = row("faq", 2, 0.7, "2025-05-01", "Laut § 10 Abs. 3 StAG ist eine Einbürgerung nach drei Jahren möglich.");
    const result = await searchSources({ queryDe: "drei Jahre", queryEn: "three years", intent: "legal" }, deps([faq], spyProvider("none")));
    const linked = result.official.find((r) => r.sectionRef === "§ 10 Abs. 3 StAG");
    expect(linked).toBeDefined();
    expect(linked?.tier).toBe(1);
    expect(linked?.excerpt).toContain("(3) (weggefallen)");
    expect(result.official[0].tier).toBe(1); // law listed before the page that cites it
  });

  it("appends an outline of all Absätze to split-section law chunks", async () => {
    const { sectionOutline } = await import("@/retrieval/search");
    expect(sectionOutline("§ 10 StAG", "(1) Ein Ausländer, der seit fünf Jahren …\n\n(2) Der Ehegatte …\n\n(3) (weggefallen)\n\n(3a) (weggefallen)\n\n(4) Die Voraussetzungen …")).toBe(
      "Übersicht aller Absätze von § 10 StAG: (1) Ein Ausländer, der seit fünf Jahren … | (2) Der Ehegatte … | (3) (weggefallen – aufgehoben) | (3a) (weggefallen – aufgehoben) | (4) Die Voraussetzungen …",
    );
    expect(sectionOutline("§ 1 StAG", "Deutscher ist, wer …")).toBe("");
    const long = `StAG § 10 (Stand: X)\n\n(1) ${"Ein Ausländer, der seit fünf Jahren … ".repeat(60)}`;
    const abs1 = { ...row("10", 1, 0.7, "2026-07-21", long), metadata: { ...row("10", 1, 0.7, "2026-07-21").metadata, sectionRef: "§ 10 Abs. 1 StAG", text: long } };
    const result = await searchSources({ queryDe: "drei Jahre", queryEn: "three years", intent: "legal" }, deps([abs1], spyProvider("none")));
    expect(result.official[0].excerpt.startsWith("StAG § 10 (Stand: X)\nÜbersicht aller Absätze von § 10 StAG:")).toBe(true);
    expect(result.official[0].excerpt).toContain("(3) (weggefallen – aufgehoben)");
  });

  it("drops rows without stored text", async () => {
    const r = row("10", 1, 0.7, "2026-07-21");
    delete (r.metadata as { text?: string }).text;
    const result = await searchSources({ queryDe: "q", queryEn: "q", intent: "legal" }, deps([r], spyProvider("none")));
    expect(result.official).toEqual([]);
    expect(result.coverage).toBe("none");
  });
});
