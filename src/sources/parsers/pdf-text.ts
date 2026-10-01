import { extractText, getDocumentProxy } from "unpdf";
import { detectStand, type StandInfo } from "./stand";

export type ParsedPdf = {
  url: string;
  title: string;
  text: string;
  pages: number;
  stand: StandInfo;
  /** Present when `sectionNumbering` detected numbered headings (AH-StAG). */
  sections?: Array<{ sectionRef: string; text: string }>;
};

/** Joins hyphenated line breaks, drops bare page numbers, normalises whitespace, keeps paragraph breaks. */
export function normalizePdfText(pages: string[]): string {
  return pages
    .map((page) =>
      page
        .replace(/\r/g, "")
        .replace(/-\n(?=[a-zäöüß])/g, "")
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .filter((line) => !/^(Seite\s+)?\d{1,3}(\s*(von|\/)\s*\d{1,3})?$/.test(line))
        .join("\n")
        .replace(/\n{2,}/g, "\n\n"),
    )
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const AH_STAG_HEADING = /^(\d{1,2}[a-z]?(?:\.\d+)+)\s+(?=\S)/;

/** Splits AH-StAG-style text ("10.1.1 …") into numbered sections. */
export function splitAhStagSections(text: string, label = "AH-StAG 2025"): Array<{ sectionRef: string; text: string }> {
  const sections: Array<{ sectionRef: string; text: string }> = [];
  let current: { sectionRef: string; lines: string[] } | null = null;
  for (const line of text.split("\n")) {
    const m = line.match(AH_STAG_HEADING);
    if (m) {
      if (current) sections.push({ sectionRef: current.sectionRef, text: current.lines.join("\n").trim() });
      current = { sectionRef: `${label} Nr. ${m[1]}`, lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push({ sectionRef: current.sectionRef, text: current.lines.join("\n").trim() });
  return sections.filter((s) => s.text.length > 40);
}

export async function pdfToText(
  data: Buffer,
  options: { url: string; title: string; standOverride?: string | null; lastModified?: string | null; fetchedAt: string; sectionNumbering?: "ah-stag" },
): Promise<ParsedPdf> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { totalPages, text: pageTexts } = await extractText(pdf, { mergePages: false });
  const text = normalizePdfText(pageTexts);
  const stand = detectStand({ text: text.slice(0, 6000), override: options.standOverride, lastModified: options.lastModified, fetchedAt: options.fetchedAt });
  const sections = options.sectionNumbering === "ah-stag" ? splitAhStagSections(text) : undefined;
  return { url: options.url, title: options.title, text, pages: totalPages, stand, sections: sections && sections.length > 5 ? sections : undefined };
}
