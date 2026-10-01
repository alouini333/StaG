import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "@/sources/parsers/html-to-markdown";
import { detectStand, parseGermanDate } from "@/sources/parsers/stand";

const html = readFileSync(path.join(__dirname, "fixtures/page.html"), "utf8");
const opts = { url: "https://www.bva.bund.de/DE/Services/x_node.html", fetchedAt: "2026-10-01T07:00:00.000Z" };

describe("htmlToMarkdown", () => {
  it("extracts the configured container, drops noise and makes links absolute", () => {
    const page = htmlToMarkdown(html, { ...opts, contentSelector: "#content" });
    expect(page.title).toBe("Einbürgerung aus dem Ausland");
    expect(page.markdown).toContain("# Einbürgerung aus dem Ausland");
    expect(page.markdown).toContain("## Voraussetzungen");
    expect(page.markdown).toContain("- Antrag nach § 14 StAG");
    expect(page.markdown).toContain("(https://www.bva.bund.de/DE/Formulare/antrag.html)");
    expect(page.markdown).not.toContain("Cookies");
    expect(page.markdown).not.toContain("trackMe");
    expect(page.markdown).not.toContain("© BVA");
  });

  it("detects the Stand line of the page", () => {
    const page = htmlToMarkdown(html, { ...opts, contentSelector: "#content" });
    expect(page.stand).toEqual({ stand: "Stand: 15.03.2026", standDate: "2026-03-15", standSource: "document" });
  });

  it("falls back to readability/body when the selector matches nothing", () => {
    const page = htmlToMarkdown(html, { ...opts, contentSelector: "#does-not-exist", lastModified: "Thu, 01 Oct 2026 07:52:35 GMT" });
    expect(page.markdown).toContain("Einbürgerung aus dem Ausland");
  });
});

describe("stand detection", () => {
  it("parses German date formats", () => {
    expect(parseGermanDate("1. Mai 2025")).toBe("2025-05-01");
    expect(parseGermanDate("01.05.2025")).toBe("2025-05-01");
    expect(parseGermanDate("Oktober 2025")).toBe("2025-10-01");
    expect(parseGermanDate("2026-07-29")).toBe("2026-07-29");
    expect(parseGermanDate("kein Datum")).toBeNull();
  });

  it("prefers override, then document, then header, then fetch time", () => {
    const base = { text: "Blah Stand: Oktober 2025 blah", lastModified: "Wed, 01 Apr 2026 11:07:37 GMT", fetchedAt: "2026-10-01T07:00:00.000Z" };
    expect(detectStand({ ...base, override: "Stand: 1. Mai 2025" }).standDate).toBe("2025-05-01");
    expect(detectStand(base)).toMatchObject({ standDate: "2025-10-01", standSource: "document" });
    expect(detectStand({ ...base, text: "nothing" })).toMatchObject({ standDate: "2026-04-01", standSource: "header" });
    expect(detectStand({ text: "nothing", fetchedAt: base.fetchedAt })).toMatchObject({ standDate: "2026-10-01", standSource: "fetched" });
  });
});
