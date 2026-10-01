import { describe, expect, it } from "vitest";
import { registry, validateRegistry } from "@/sources/registry";
import { chunkId, chunkMetadataSchema, parseChunkId, tierLabel, type ChunkMetadataInput } from "@/sources/types";

const base: ChunkMetadataInput = {
  sourceId: "stag",
  tier: 1,
  kind: "gii-law",
  title: "Staatsangehörigkeitsgesetz (StAG)",
  url: "https://www.gesetze-im-internet.de/stag/__10.html",
  lang: "de",
  jurisdictionScope: "federal",
  sectionRef: "§ 10 StAG",
  lawAbbrev: "StAG",
  stand: "Zuletzt geändert durch Art. 3 G v. 21.7.2026 I Nr. 221",
  standDate: "2026-07-21",
  fetchedAt: "2026-10-01T06:00:00.000Z",
  sourceVersion: "20260810220001",
  contentHash: "abc",
  chunkIndex: 0,
  versionId: "20260810220001",
  validFrom: "2026-07-29",
};

describe("tier labels", () => {
  it("has German and English labels for every tier", () => {
    expect(tierLabel(1, "de")).toBe("Gesetz");
    expect(tierLabel(1, "en")).toBe("Law");
    expect(tierLabel(4, "en")).toMatch(/Community/);
  });
});

describe("registry", () => {
  it("contains StAG as the first tier-1 law", () => {
    const stag = registry.find((s) => s.id === "stag");
    expect(stag?.tier).toBe(1);
    expect(stag?.kind).toBe("gii-law");
    expect(stag?.enabled).toBe(true);
  });

  it("has the tier-1..3 sources with https urls and unique ids", () => {
    expect(registry.length).toBeGreaterThan(15);
    expect(new Set(registry.map((s) => s.id)).size).toBe(registry.length);
    expect(registry.filter((s) => s.tier === 1).length).toBeGreaterThanOrEqual(5);
    expect(registry.filter((s) => s.tier === 3).every((s) => s.jurisdictionScope === "Berlin")).toBe(true);
    expect(registry.find((s) => s.id === "bamf-gesamtfragenkatalog")?.enabled).toBe(false);
  });

  it("rejects duplicate ids and invalid entries", () => {
    const [stag] = registry;
    expect(() => validateRegistry([stag, stag])).toThrow(/Duplicate source id/);
    expect(() => validateRegistry([{ ...stag, id: "Bad Id" }])).toThrow(/Invalid source definition/);
    expect(() => validateRegistry([{ ...stag, url: "not-a-url" }])).toThrow(/url/);
  });
});

describe("chunk metadata", () => {
  it("accepts a valid law chunk and defaults historical to false", () => {
    const parsed = chunkMetadataSchema.parse(base);
    expect(parsed.historical).toBe(false);
  });

  it("requires community metadata for tier 4", () => {
    const result = chunkMetadataSchema.safeParse({ ...base, tier: 4, kind: "community-notes", sectionRef: undefined, lawAbbrev: undefined });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/community/);
  });

  it("requires sectionRef and lawAbbrev for gii-law chunks", () => {
    expect(chunkMetadataSchema.safeParse({ ...base, sectionRef: undefined }).success).toBe(false);
  });

  it("rejects validTo before validFrom and historical chunks without validTo", () => {
    expect(chunkMetadataSchema.safeParse({ ...base, validTo: "2026-01-01" }).success).toBe(false);
    expect(chunkMetadataSchema.safeParse({ ...base, historical: true }).success).toBe(false);
    expect(chunkMetadataSchema.safeParse({ ...base, historical: true, validTo: "2026-09-01" }).success).toBe(true);
  });

  it("accepts a tier-2 html chunk without law fields", () => {
    expect(
      chunkMetadataSchema.safeParse({
        ...base,
        sourceId: "bmi-einbuergerung",
        tier: 2,
        kind: "html-page",
        sectionRef: undefined,
        lawAbbrev: undefined,
        versionId: undefined,
        validFrom: undefined,
      }).success,
    ).toBe(true);
  });
});

describe("chunk ids", () => {
  it("round-trips", () => {
    const id = chunkId("stag", "20260810220001", 12);
    expect(id).toBe("stag::20260810220001::12");
    expect(parseChunkId(id)).toEqual({ sourceId: "stag", sourceVersion: "20260810220001", chunkIndex: 12 });
    expect(parseChunkId("garbage")).toBeNull();
    expect(parseChunkId("a::b::-1")).toBeNull();
  });
});
