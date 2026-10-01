import { describe, expect, it } from "vitest";
import { normalizePdfText, splitAhStagSections } from "@/sources/parsers/pdf-text";

describe("normalizePdfText", () => {
  it("joins hyphenated line breaks, drops page numbers and normalises whitespace", () => {
    const pages = ["Die Einbürge-\nrung  ist   möglich.\n\n12", "Seite 13\nZweite Seite."];
    const text = normalizePdfText(pages);
    expect(text).toContain("Die Einbürgerung ist möglich.");
    expect(text).not.toMatch(/\n12\n|Seite 13/);
    expect(text).toContain("Zweite Seite.");
  });
});

describe("splitAhStagSections", () => {
  it("splits numbered AH-StAG headings into sections", () => {
    const text = [
      "Vorbemerkung ohne Nummer.",
      "10 Zu § 10",
      "10.1 Zu Absatz 1",
      "10.1.1 Der rechtmäßige gewöhnliche Aufenthalt muss seit fünf Jahren bestehen und weitere Erläuterungen folgen hier.",
      "Fortsetzung des Absatzes mit genügend Text, damit der Abschnitt nicht herausgefiltert wird.",
      "10.1.2 Handlungsfähigkeit nach § 34 Satz 1 StAG oder gesetzliche Vertretung ist erforderlich.",
    ].join("\n");
    const sections = splitAhStagSections(text);
    expect(sections.map((s) => s.sectionRef)).toEqual(["AH-StAG 2025 Nr. 10.1.1", "AH-StAG 2025 Nr. 10.1.2"]);
    expect(sections[0].text).toContain("Fortsetzung des Absatzes");
  });
});
