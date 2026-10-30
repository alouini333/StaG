import { describe, expect, it } from "vitest";
import {
  assessCoverage,
  assignCitationIds,
  dedupeBySection,
  flagOutdated,
  orderOfficial,
  RETRIEVAL,
  shouldIncludeCommunity,
  toExcerpt,
  type Coverage,
  type Intent,
  type RetrievedChunk,
} from "@/retrieval/hierarchy";

const chunk = (tier: 1 | 2 | 3, score: number, extra: Partial<RetrievedChunk["metadata"]> = {}, id = `${tier}-${score}`): RetrievedChunk => ({
  id,
  score,
  text: `text ${id}`,
  metadata: {
    sourceId: `src-${tier}`,
    tier,
    kind: tier === 1 ? "gii-law" : "html-page",
    title: `Title ${tier}`,
    url: `https://example.org/${id}`,
    lang: "de",
    jurisdictionScope: "federal",
    fetchedAt: "2026-10-01T00:00:00.000Z",
    sourceVersion: "v",
    contentHash: "h",
    chunkIndex: 0,
    historical: false,
    ...(tier === 1 ? { sectionRef: `§ ${id} StAG`, lawAbbrev: "StAG" } : {}),
    ...extra,
  },
});

describe("orderOfficial", () => {
  it("orders tiers 1→2→3 regardless of score and caps per tier", () => {
    const results = [chunk(3, 0.9), chunk(2, 0.8), ...Array.from({ length: 8 }, (_, i) => chunk(1, 0.5 + i / 100, {}, `law-${i}`))];
    const ordered = orderOfficial(results);
    expect(ordered.map((r) => r.metadata.tier)).toEqual([1, 1, 1, 1, 1, 1, 2, 3]);
    expect(ordered[0].score).toBeGreaterThan(ordered[5].score);
  });

  it("always lists law before higher-scoring authority pages", () => {
    const ordered = orderOfficial([chunk(2, 0.9), chunk(1, RETRIEVAL.tier1Floor + 0.01)]);
    expect(ordered.map((r) => r.metadata.tier)).toEqual([1, 2]);
    expect(orderOfficial([chunk(2, 0.9), chunk(3, 0.95)]).map((r) => r.metadata.tier)).toEqual([2, 3]);
  });
});

describe("dedupeBySection", () => {
  it("keeps the best-scoring chunk per section", () => {
    const a = chunk(1, 0.7, { sectionRef: "§ 10 StAG" }, "a");
    const b = chunk(1, 0.6, { sectionRef: "§ 10 StAG" }, "b");
    expect(dedupeBySection([b, a]).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("assessCoverage", () => {
  it("classifies strong, partial and none", () => {
    expect(assessCoverage([chunk(1, 0.7), chunk(1, 0.65)])).toBe("strong");
    expect(assessCoverage([chunk(1, 0.7), chunk(1, 0.45)])).toBe("partial");
    expect(assessCoverage([chunk(1, 0.55)])).toBe("partial");
    expect(assessCoverage([chunk(1, 0.4)])).toBe("none");
    expect(assessCoverage([])).toBe("none");
  });
});

describe("shouldIncludeCommunity (full matrix)", () => {
  const expected: Record<Intent, Record<Coverage, boolean>> = {
    legal: { strong: false, partial: false, none: true },
    procedural: { strong: false, partial: true, none: true },
    mixed: { strong: false, partial: true, none: true },
    experience: { strong: true, partial: true, none: true },
  };
  for (const intent of Object.keys(expected) as Intent[]) {
    for (const coverage of ["strong", "partial", "none"] as Coverage[]) {
      it(`${intent} × ${coverage} → ${expected[intent][coverage]}`, () => {
        const gate = shouldIncludeCommunity({ intent, coverage });
        expect(gate.include).toBe(expected[intent][coverage]);
        expect(gate.reason.length).toBeGreaterThan(5);
      });
    }
  }
});

describe("flagOutdated", () => {
  it("flags tier 2/3 results older than the law's Stand, never tier 1", () => {
    const law = chunk(1, 0.7, { standDate: "2026-07-21" });
    const oldFaq = chunk(2, 0.7, { standDate: "2025-05-01" });
    const freshPage = chunk(2, 0.7, { standDate: "2026-09-01" });
    const undated = chunk(3, 0.7, { standDate: undefined, fetchedAt: "2026-10-01T00:00:00.000Z" });
    const fetchDated = chunk(2, 0.7, { stand: "Abgerufen am 2026-10-01", standDate: "2026-10-01" });
    const flagged = flagOutdated([law, oldFaq, freshPage, undated, fetchDated], { StAG: "2026-07-21" });
    expect(flagged.map((r) => r.possiblyOutdated)).toEqual([false, true, false, true, true]);
    expect(flagOutdated([oldFaq], {})[0].possiblyOutdated).toBe(false);
  });
});

describe("citedProvisions", () => {
  it("finds provisions cited in authority excerpts, not in law chunks", async () => {
    const { citedProvisions } = await import("@/retrieval/hierarchy");
    const faq = { ...chunk(2, 0.7), text: "Nach § 10 Abs. 3 StAG ist eine Einbürgerung nach drei Jahren möglich; siehe auch § 9 StAG und Art. 116 GG." };
    const law = { ...chunk(1, 0.7), text: "§ 12 StAG wird hier zitiert" };
    expect(citedProvisions([faq, law])).toEqual([
      { lawAbbrev: "StAG", sectionKey: "10", paragraph: 3, from: "Title 2" },
      { lawAbbrev: "StAG", sectionKey: "9", paragraph: null, from: "Title 2" },
    ]);
  });
});

describe("assignCitationIds / toExcerpt", () => {
  it("numbers official first, then community, and truncates excerpts at word boundaries", () => {
    const official = flagOutdated([chunk(1, 0.7), chunk(2, 0.6)], { StAG: "2026-07-21" });
    const { official: o, community: c } = assignCitationIds(official, [], "en");
    expect(o.map((r) => r.citationId)).toEqual(["S1", "S2"]);
    expect(o[0].tierLabel).toBe("Law");
    expect(c).toEqual([]);
    const long = "word ".repeat(400);
    const excerpt = toExcerpt(long, 100);
    expect(excerpt.length).toBeLessThanOrEqual(101);
    expect(excerpt.endsWith("…")).toBe(true);
  });
});
