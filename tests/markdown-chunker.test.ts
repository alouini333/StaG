import { describe, expect, it } from "vitest";
import { chunkDocument, chunkMarkdown } from "@/sources/chunkers/markdown";
import { registry } from "@/sources/registry";
import { chunkMetadataSchema } from "@/sources/types";

const md = [
  "# Einbürgerung",
  "Intro paragraph. ".repeat(20).trim(),
  "## Voraussetzungen",
  "Erster Absatz zu Voraussetzungen. ".repeat(30).trim(),
  "- Punkt eins\n- Punkt zwei",
  "## Gebühren",
  "Die Gebühr beträgt 255 Euro. ".repeat(10).trim(),
].join("\n\n");

describe("chunkMarkdown", () => {
  it("respects the size limit and tracks the nearest heading", () => {
    const chunks = chunkMarkdown(md, { maxSize: 500, overlap: 60 });
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(500 + 80);
    expect(chunks.find((c) => c.text.includes("Gebühr"))?.heading).toBe("Gebühren");
    expect(chunks.find((c) => c.text.includes("Punkt eins"))?.heading).toBe("Voraussetzungen");
  });

  it("splits oversized paragraphs by sentence", () => {
    const long = "Satz eins ist hier. ".repeat(80).trim();
    const chunks = chunkMarkdown(long, { maxSize: 300, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(320);
  });

  it("prepends overlap context from the previous chunk", () => {
    const chunks = chunkMarkdown(md, { maxSize: 400, overlap: 80 });
    expect(chunks.slice(1).some((c) => c.text.startsWith("… "))).toBe(true);
  });
});

describe("chunkDocument", () => {
  const source = registry.find((s) => s.id === "bva-staatsangehoerigkeit-de")!;
  it("produces validated chunks with headers, publisher and stand", () => {
    const { chunks, nextIndex } = chunkDocument({
      source,
      fetched: { url: "https://www.bva.bund.de/x.html", fetchedAt: "2026-10-01T07:00:00.000Z", contentHash: "abc" },
      title: "Einbürgerung aus dem Ausland",
      stand: { stand: "Stand: 15.03.2026", standDate: "2026-03-15", standSource: "document" },
      text: md,
      publisher: "Bundesverwaltungsamt (BVA)",
      sourceVersion: "v1",
      startIndex: 3,
    });
    expect(nextIndex).toBe(3 + chunks.length);
    expect(chunks[0].id).toBe("bva-staatsangehoerigkeit-de::v1::3");
    expect(chunks[0].text.startsWith("Einbürgerung aus dem Ausland")).toBe(true);
    expect(chunks[0].text).toContain("(Quelle: Bundesverwaltungsamt (BVA), Stand: 15.03.2026)");
    for (const c of chunks) {
      expect(chunkMetadataSchema.safeParse(c.metadata).success).toBe(true);
      expect(c.metadata.tier).toBe(2);
      expect(c.metadata.standDate).toBe("2026-03-15");
    }
  });

  it("uses pre-split sections as sectionRef (AH-StAG numbering)", () => {
    const { chunks } = chunkDocument({
      source,
      fetched: { url: "https://www.bmi.bund.de/x.pdf", fetchedAt: "2026-10-01T07:00:00.000Z", contentHash: "abc" },
      title: "AH-StAG 2025",
      stand: { stand: "Stand: 1. Mai 2025", standDate: "2025-05-01", standSource: "override" },
      text: "",
      sections: [{ sectionRef: "AH-StAG 2025 Nr. 10.1.1", text: "10.1.1 Zu Absatz 1: Fünf Jahre rechtmäßiger gewöhnlicher Aufenthalt sind erforderlich." }],
      publisher: "BMI",
      sourceVersion: "v1",
      startIndex: 0,
    });
    expect(chunks[0].metadata.sectionRef).toBe("AH-StAG 2025 Nr. 10.1.1");
    expect(chunks[0].text).toContain("AH-StAG 2025 – AH-StAG 2025 Nr. 10.1.1");
  });
});
