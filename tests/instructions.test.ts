import { describe, expect, it } from "vitest";
import { buildInstructions } from "@/mastra/agents/instructions";

const status = {
  lastIngestedAt: "2026-10-01T07:19:09.000Z",
  indexAgeDays: 0,
  stale: false,
  laws: [{ lawAbbrev: "StAG", stand: "Zuletzt geändert durch Art. 3 G v. 21.7.2026 I Nr. 221", standDate: "2026-07-21" }],
  pendingSources: [],
};

describe("buildInstructions", () => {
  const text = buildInstructions({ indexStatus: status });

  it("contains the policy sections and the live index status", () => {
    for (const needle of ["searchCitizenshipSources", "lookupStatute", "tier 1", "possiblyOutdated", "historical", "[S1]", "Never write URLs", "2026-10-01", "StAG: Zuletzt geändert"]) {
      expect(text).toContain(needle);
    }
  });

  it("never hard-codes legal facts (numbers of years etc.)", () => {
    for (const forbidden of [/\b8 Jahre\b/i, /\bacht Jahre\b/i, /\beight years\b/i, /\bfive years\b/i, /\b5 Jahre\b/i, /\bfünf Jahre\b/i, /\bthree years\b/i, /\bdrei Jahre\b/i, /\b3 Jahre\b/i, /\bB1\b/, /\bB2\b/]) {
      expect(text).not.toMatch(forbidden);
    }
  });

  it("flags a stale or unknown index", () => {
    expect(buildInstructions({ indexStatus: { ...status, stale: true, indexAgeDays: 45 } })).toContain("STALE");
    expect(buildInstructions({ indexStatus: null })).toContain("possibly stale");
  });
});
