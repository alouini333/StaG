import { describe, expect, it } from "vitest";
import { extractParagraph, lookupStatute, parseStatuteRef } from "@/retrieval/statute";

describe("parseStatuteRef", () => {
  it("normalises common ways of citing a provision", () => {
    expect(parseStatuteRef({ section: "§10" })).toMatchObject({ lawAbbrev: "StAG", sectionKey: "10", paragraph: null });
    expect(parseStatuteRef({ section: "§ 10 Abs. 3 StAG" })).toMatchObject({ sectionKey: "10", paragraph: 3 });
    expect(parseStatuteRef({ section: "12a", paragraph: 1 })).toMatchObject({ sectionKey: "12a", paragraph: 1 });
    expect(parseStatuteRef({ lawAbbrev: "GG", section: "Art. 16" })).toMatchObject({ lawAbbrev: "GG", sectionKey: "art16", isArticle: true });
    expect(parseStatuteRef({ section: "Artikel 116 Absatz 2 GG" })).toMatchObject({ lawAbbrev: "GG", sectionKey: "art116", paragraph: 2 });
    expect(() => parseStatuteRef({ section: "nothing" })).toThrow();
  });
});

describe("extractParagraph", () => {
  const text = "(1) Erster Absatz.\n\n(2) Zweiter Absatz mit\n 1. Punkt\n 2. Punkt\n\n(3) (weggefallen)";
  it("returns a single Absatz including its list lines", () => {
    expect(extractParagraph(text, 2)).toBe("(2) Zweiter Absatz mit\n 1. Punkt\n 2. Punkt");
    expect(extractParagraph(text, 3)).toBe("(3) (weggefallen)");
    expect(extractParagraph(text, 9)).toBeNull();
  });
});

describe("lookupStatute", () => {
  const db = {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes("from law_sections")) {
        const key = params?.[1];
        if (key !== "10") return { rows: [], rowCount: 0 };
        return { rows: [{ law_abbrev: "StAG", version_id: "v2", section_key: "10", section_ref: "§ 10 StAG", title: null, text: "(1) Erster.\n\n(3) (weggefallen)", url: "https://www.gesetze-im-internet.de/stag/__10.html", repealed: false }], rowCount: 1 };
      }
      if (sql.includes("from law_versions")) return { rows: [{ law_abbrev: "StAG", version_id: "v2", builddate: null, stand: "Stand X", stand_date: "2026-07-21", valid_from: null, valid_to: null, is_current: true, source_url: null, archived_at: null }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  } as never;

  it("returns the section or a single Absatz with a citation id", async () => {
    const whole = await lookupStatute(db, { section: "§ 10" });
    expect(whole).toMatchObject({ found: true, citationId: "L-StAG-10", sectionRef: "§ 10 StAG", stand: "Stand X" });
    const abs3 = await lookupStatute(db, { section: "§ 10 Abs. 3" });
    expect(abs3).toMatchObject({ found: true, citationId: "L-StAG-10-3", sectionRef: "§ 10 Abs. 3 StAG", text: "(3) (weggefallen)", repealed: true });
    expect(await lookupStatute(db, { section: "§ 99" })).toMatchObject({ found: false });
  });
});
