import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseGiiLaw, sectionKeyFromEnbez, sectionRefFromEnbez, sectionUrl, standDateFromKommentar } from "@/sources/parsers/gii-norm";

const xml = readFileSync(path.join(__dirname, "fixtures/stag-excerpt.xml"), "utf8");

describe("parseGiiLaw", () => {
  const parsed = parseGiiLaw(xml, { slug: "stag" });

  it("reads the law header", () => {
    expect(parsed.law.abbrev).toBe("StAG");
    expect(parsed.law.title).toBe("Staatsangehörigkeitsgesetz");
    expect(parsed.law.stand).toBe("Zuletzt geändert durch Art. 3 G v. 21.7.2026 I Nr. 221");
    expect(parsed.law.standDate).toBe("2026-07-21");
    expect(parsed.law.builddate).toBe("20260810220001");
  });

  it("parses sections with keys, refs and urls", () => {
    const keys = parsed.sections.map((s) => s.sectionKey);
    expect(keys).toEqual(["1", "2", "10", "12", "18-19", "35a"]);
    const s10 = parsed.sections.find((s) => s.sectionKey === "10")!;
    expect(s10.sectionRef).toBe("§ 10 StAG");
    expect(s10.url).toBe("https://www.gesetze-im-internet.de/stag/__10.html");
    expect(s10.absaetze.length).toBe(9);
    expect(s10.absaetze[0].n).toBe("1");
  });

  it("renders enumerations as numbered lines, nested lists indented", () => {
    const s10 = parsed.sections.find((s) => s.sectionKey === "10")!;
    expect(s10.text).toContain("(1) Ein Ausländer, der seit fünf Jahren");
    expect(s10.text).toMatch(/\n\s+1\. sich zur freiheitlichen demokratischen Grundordnung/);
    expect(s10.text).toMatch(/\n\s+a\) gegen die freiheitliche demokratische Grundordnung/);
    expect(s10.text).toMatch(/\n\s+1a\. sich zur besonderen historischen Verantwortung/);
  });

  it("marks repealed provisions", () => {
    const s2 = parsed.sections.find((s) => s.sectionKey === "2")!;
    expect(s2.repealed).toBe(true);
    expect(s2.text).toBe("(weggefallen)");
    const s12 = parsed.sections.find((s) => s.sectionKey === "12")!;
    expect(s12.repealed).toBe(true);
    expect(s12.title).toBeNull();
    const group = parsed.sections.find((s) => s.sectionKey === "18-19")!;
    expect(group.repealed).toBe(true);
    expect(group.sectionRef).toBe("§§ 18 und 19 StAG");
    const s10 = parsed.sections.find((s) => s.sectionKey === "10")!;
    expect(s10.absaetze.find((a) => a.n === "3")?.repealed).toBe(true);
    expect(s10.repealed).toBe(false);
  });

  it("keeps section titles when present", () => {
    expect(parsed.sections.find((s) => s.sectionKey === "35a")?.title).toBe("Sperrfrist");
  });

  it("honours includeSections", () => {
    const only = parseGiiLaw(xml, { slug: "stag", includeSections: ["10", "35a"] });
    expect(only.sections.map((s) => s.sectionKey)).toEqual(["10", "35a"]);
  });
});

describe("helpers", () => {
  it("derives keys, refs and urls for § and Art", () => {
    expect(sectionKeyFromEnbez("§ 12a")).toEqual({ key: "12a", repealedGroup: false });
    expect(sectionKeyFromEnbez("Art 116")).toEqual({ key: "art116", repealedGroup: false });
    expect(sectionKeyFromEnbez("(XXXX) §§ 18 und 19")).toEqual({ key: "18-19", repealedGroup: true });
    expect(sectionRefFromEnbez("Art 16", "GG")).toBe("Art. 16 GG");
    expect(sectionUrl("gg", "art16", false)).toBe("https://www.gesetze-im-internet.de/gg/art_16.html");
    expect(sectionUrl("stag", "12a", false)).toBe("https://www.gesetze-im-internet.de/stag/__12a.html");
    expect(sectionUrl("stag", "18-19", true)).toBe("https://www.gesetze-im-internet.de/stag/");
  });

  it("parses the Stand date", () => {
    expect(standDateFromKommentar("Zuletzt geändert durch Art. 3 G v. 21.7.2026 I Nr. 221")).toBe("2026-07-21");
    expect(standDateFromKommentar("Neugefasst durch Bek. v. 1.3.2024 I Nr. 100")).toBe("2024-03-01");
    expect(standDateFromKommentar(null)).toBeNull();
    expect(standDateFromKommentar("Stand unbekannt")).toBeNull();
  });
});
