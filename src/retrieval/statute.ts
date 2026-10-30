import { getCurrentLawVersion, getLawSection, type Queryable } from "../db/repositories";

export type StatuteRef = { lawAbbrev: string; sectionKey: string; paragraph: number | null; isArticle: boolean };

/** "§ 10 Abs. 3 StAG", "§10", "10 StAG", "Art. 16 GG", "Artikel 116 Absatz 2 GG" → structured reference. */
export function parseStatuteRef(input: { lawAbbrev?: string; section: string; paragraph?: number | null }, defaultLaw = "StAG"): StatuteRef {
  const raw = input.section.trim();
  const law = input.lawAbbrev?.trim() || raw.match(/\b(StAG|GG|AufenthG|FreizügG\/EU|EinbTestV|AsylG)\b/i)?.[1] || defaultLaw;
  const isArticle = /^art/i.test(raw) || /^GG$/i.test(law);
  const number = raw.match(/(\d+[a-z]?)/i)?.[1]?.toLowerCase();
  if (!number) throw new Error(`Cannot parse section reference "${input.section}"`);
  const absatz = input.paragraph ?? (raw.match(/(?:Abs\.?|Absatz)\s*(\d+)/i) ? Number(raw.match(/(?:Abs\.?|Absatz)\s*(\d+)/i)![1]) : null);
  const canonicalLaw = law.replace(/^stag$/i, "StAG").replace(/^gg$/i, "GG").replace(/^aufenthg$/i, "AufenthG");
  return { lawAbbrev: canonicalLaw, sectionKey: isArticle ? `art${number}` : number, paragraph: absatz, isArticle };
}

/** Extracts "(n) …" from a section text rendered by the GII parser. */
export function extractParagraph(text: string, n: number): string | null {
  const parts = text.split(/\n\n(?=\(\d+[a-z]?\)\s)/);
  const match = parts.find((p) => new RegExp(`^\\(${n}[a-z]?\\)\\s`).test(p));
  return match?.trim() ?? null;
}

export type StatuteLookup =
  | { found: false; lawAbbrev: string; sectionKey: string; message: string }
  | {
      found: true;
      citationId: string;
      lawAbbrev: string;
      sectionRef: string;
      title: string | null;
      text: string;
      url: string | null;
      stand: string | null;
      standDate: string | null;
      repealed: boolean;
      versionId: string;
      paragraph: number | null;
    };

export async function lookupStatute(db: Queryable, input: { lawAbbrev?: string; section: string; paragraph?: number | null }): Promise<StatuteLookup> {
  const ref = parseStatuteRef(input);
  const [section, version] = await Promise.all([getLawSection(db, ref.lawAbbrev, ref.sectionKey), getCurrentLawVersion(db, ref.lawAbbrev)]);
  if (!section) {
    return { found: false, lawAbbrev: ref.lawAbbrev, sectionKey: ref.sectionKey, message: `${ref.isArticle ? "Art." : "§"} ${ref.sectionKey.replace(/^art/, "")} ${ref.lawAbbrev} is not in the index (law not ingested or section does not exist).` };
  }
  let text = section.text;
  let sectionRef = section.sectionRef;
  if (ref.paragraph !== null) {
    const para = extractParagraph(section.text, ref.paragraph);
    if (para) {
      text = para;
      sectionRef = section.sectionRef.replace(/^(§ \d+[a-z]?|Art\. \d+[a-z]?)/, (m) => `${m} Abs. ${ref.paragraph}`);
    }
  }
  return {
    found: true,
    citationId: `L-${ref.lawAbbrev.replace(/[^A-Za-z0-9]/g, "")}-${ref.sectionKey}${ref.paragraph !== null ? `-${ref.paragraph}` : ""}`,
    lawAbbrev: ref.lawAbbrev,
    sectionRef,
    title: section.title,
    text,
    url: section.url,
    stand: version?.stand ?? null,
    standDate: version?.standDate ?? null,
    repealed: section.repealed || /^\s*(\(\d+[a-z]?\)\s*)?\(weggefallen\)\s*$/i.test(text),
    versionId: section.versionId,
    paragraph: ref.paragraph,
  };
}
