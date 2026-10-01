import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chunkLaw, groupAbsaetze, MAX_SECTION_CHUNK_CHARS } from "@/sources/chunkers/law-sections";
import { parseGiiLaw } from "@/sources/parsers/gii-norm";
import { registry } from "@/sources/registry";
import { chunkMetadataSchema, parseChunkId } from "@/sources/types";

const xml = readFileSync(path.join(__dirname, "fixtures/stag-excerpt.xml"), "utf8");
const parsed = parseGiiLaw(xml, { slug: "stag" });
const stag = registry.find((s) => s.id === "stag")!;
if (stag.kind !== "gii-law") throw new Error("fixture registry entry must be gii-law");
const ctx = { source: stag, law: parsed.law, fetchedAt: "2026-10-01T07:00:00.000Z", contentHash: "hash", versionId: "20260810220001" };

describe("chunkLaw", () => {
  const chunks = chunkLaw(parsed, ctx);

  it("produces valid metadata and sequential ids", () => {
    chunks.forEach((c, i) => {
      expect(chunkMetadataSchema.safeParse(c.metadata).success).toBe(true);
      expect(parseChunkId(c.id)).toEqual({ sourceId: "stag", sourceVersion: "20260810220001", chunkIndex: i });
      expect(c.metadata.versionId).toBe("20260810220001");
      expect(c.metadata.validFrom).toBe("2026-07-21");
      expect(c.metadata.historical).toBe(false);
    });
  });

  it("splits long sections by Absätze and labels single-Absatz chunks", () => {
    const s10 = chunks.filter((c) => c.metadata.sectionRef?.startsWith("§ 10"));
    expect(s10.length).toBeGreaterThan(1);
    // Multi-Absatz groups respect the limit; a single oversized Absatz (Abs. 1 is ~3,700 chars) stays whole.
    for (const c of s10) {
      if (!/Abs\./.test(c.metadata.sectionRef ?? "")) expect(c.text.length).toBeLessThanOrEqual(MAX_SECTION_CHUNK_CHARS + 200);
    }
    expect(s10.some((c) => /^§ 10 Abs\. \d+[a-z]? StAG$/.test(c.metadata.sectionRef ?? ""))).toBe(true);
    expect(s10[0].text.startsWith("StAG § 10 (Stand: Zuletzt geändert")).toBe(true);
  });

  it("keeps repealed sections as short chunks and shows repealed Absätze", () => {
    const s12 = chunks.find((c) => c.metadata.sectionRef === "§ 12 StAG")!;
    expect(s12.text).toContain("(weggefallen)");
    const s10 = chunks.filter((c) => c.metadata.sectionRef?.startsWith("§ 10"));
    expect(s10.map((c) => c.text).join("\n")).toContain("(3) (weggefallen)");
  });

  it("adds the title to the header when present", () => {
    const s35a = chunks.find((c) => c.metadata.sectionRef === "§ 35a StAG")!;
    expect(s35a.text.startsWith("StAG § 35a – Sperrfrist")).toBe(true);
  });
});

describe("groupAbsaetze", () => {
  it("never splits an Absatz and respects the limit", () => {
    const section = parsed.sections.find((s) => s.sectionKey === "10")!;
    const groups = groupAbsaetze(section, 1200);
    expect(groups.flat().length).toBe(section.absaetze.length);
    for (const g of groups) {
      if (g.length > 1) expect(g.reduce((n, a) => n + a.text.length + 2, 0)).toBeLessThanOrEqual(1200);
    }
  });
});
