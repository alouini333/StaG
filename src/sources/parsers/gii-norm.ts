import { XMLParser } from "fast-xml-parser";

/**
 * Parser for the gesetze-im-internet.de norm XML (DTD gii-norm.dtd, v1.01).
 * Structure (verified on StAG, Oct 2026): <dokumente builddate doknr> contains
 * <norm> elements. Norm 0 is the law header (jurabk/amtabk/langue/standangabe);
 * the others carry <enbez> ("§ 10", "Art 16", "(XXXX) §§ 18 und 19"), an
 * optional <titel>, and <textdaten><text><Content> with one <P> per Absatz,
 * enumerations as <DL><DT>1.</DT><DD><LA>…</LA></DD></DL>, plus <fussnoten>.
 */

export type ParsedAbsatz = { n: string | null; text: string; repealed: boolean };

export type ParsedSection = {
  /** Key used in URLs and the law_sections table: "10", "12a", "art16", "18-19". */
  sectionKey: string;
  /** Human citation: "§ 10 StAG", "Art. 16 GG". */
  sectionRef: string;
  enbez: string;
  title: string | null;
  text: string;
  url: string;
  absaetze: ParsedAbsatz[];
  repealed: boolean;
  footnotes: string | null;
};

export type ParsedLaw = {
  law: {
    abbrev: string;
    title: string;
    stand: string | null;
    standDate: string | null;
    builddate: string | null;
    doknr: string | null;
  };
  sections: ParsedSection[];
};

type Node = Record<string, unknown>;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: false,
  parseTagValue: false,
  processEntities: true,
  htmlEntities: true,
});

// ------------------------------------------------------------- tree helpers

/** Element name of a node; null for text nodes (`{ "#text": "…" }`). */
function tagName(node: Node): string | null {
  if ("#text" in node) return null;
  return Object.keys(node).find((k) => k !== ":@") ?? null;
}

function childrenOf(node: Node): Node[] {
  const name = tagName(node);
  const value = name ? node[name] : undefined;
  return Array.isArray(value) ? (value as Node[]) : [];
}

function attrs(node: Node): Record<string, string> {
  return (node[":@"] as Record<string, string> | undefined) ?? {};
}

function find(nodes: Node[], name: string): Node | undefined {
  return nodes.find((n) => tagName(n) === name);
}

function findAll(nodes: Node[], name: string): Node[] {
  return nodes.filter((n) => tagName(n) === name);
}

/** Plain text of a node (all descendants, whitespace collapsed). */
function plainText(node: Node | undefined): string {
  if (!node) return "";
  if ("#text" in node) return String(node["#text"]);
  return childrenOf(node).map(plainText).join("");
}

/**
 * Renders mixed content to readable text: paragraphs separated by newlines,
 * enumerations as "1. …" lines (nested lists indented), <BR> as newline.
 */
function renderInline(nodes: Node[], depth = 0): string {
  let out = "";
  for (const node of nodes) {
    if ("#text" in node) {
      out += String(node["#text"]);
      continue;
    }
    const name = tagName(node);
    if (name === "BR") {
      out += "\n";
    } else if (name === "DL") {
      out += "\n" + renderList(node, depth);
    } else if (name === "P") {
      out += renderInline(childrenOf(node), depth) + "\n";
    } else if (name) {
      out += renderInline(childrenOf(node), depth);
    }
  }
  return out;
}

function renderList(dl: Node, depth: number): string {
  const indent = "  ".repeat(depth + 1);
  const items = childrenOf(dl);
  const lines: string[] = [];
  let marker = "";
  for (const item of items) {
    const name = tagName(item);
    if (name === "DT") {
      marker = collapse(plainText(item));
    } else if (name === "DD") {
      const body = renderInline(childrenOf(item), depth + 1);
      const [first, ...rest] = body.split("\n").map((l) => l.trimEnd());
      lines.push(`${indent}${marker} ${collapse(first)}`.trimEnd());
      for (const line of rest) if (line.trim()) lines.push(line.startsWith(" ") ? line : `${indent}  ${line.trim()}`);
      marker = "";
    }
  }
  return lines.join("\n") + "\n";
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function tidy(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^([ \t]*)(.*)$/, (_, lead: string, rest: string) => lead + rest.replace(/[ \t]+/g, " ")).trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ------------------------------------------------------------- section helpers

export function sectionKeyFromEnbez(enbez: string): { key: string; repealedGroup: boolean } {
  const trimmed = enbez.trim();
  const repealedGroup = /^\(XXXX\)/.test(trimmed);
  const body = trimmed.replace(/^\(XXXX\)\s*/, "");
  const art = body.match(/^Art(?:ikel)?\.?\s*(\d+[a-z]?)/i);
  if (art) return { key: `art${art[1].toLowerCase()}`, repealedGroup };
  const range = body.match(/^§§\s*(\d+[a-z]?)\s*(?:und|bis|-)\s*(\d+[a-z]?)/i);
  if (range) return { key: `${range[1]}-${range[2]}`.toLowerCase(), repealedGroup };
  const single = body.match(/^§\s*(\d+[a-z]?)/i);
  if (single) return { key: single[1].toLowerCase(), repealedGroup };
  return { key: body.replace(/[^a-z0-9]+/gi, "-").toLowerCase(), repealedGroup };
}

export function sectionRefFromEnbez(enbez: string, abbrev: string): string {
  const body = enbez.trim().replace(/^\(XXXX\)\s*/, "");
  const art = body.match(/^Art(?:ikel)?\.?\s*(\d+[a-z]?)/i);
  if (art) return `Art. ${art[1]} ${abbrev}`;
  return `${collapse(body)} ${abbrev}`;
}

export function sectionUrl(slug: string, key: string, repealedGroup: boolean): string {
  const base = `https://www.gesetze-im-internet.de/${slug}/`;
  if (repealedGroup || key.includes("-")) return base;
  if (key.startsWith("art")) return `${base}art_${key.slice(3)}.html`;
  return `${base}__${key}.html`;
}

/** "Zuletzt geändert durch Art. 3 G v. 21.7.2026 I Nr. 221" → "2026-07-21" */
export function standDateFromKommentar(stand: string | null): string | null {
  if (!stand) return null;
  const m = stand.match(/v\.\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

const WEGGEFALLEN = /^\s*(\(\d+[a-z]?\)\s*)?\(weggefallen\)\s*$/i;

function parseAbsaetze(content: Node | undefined): ParsedAbsatz[] {
  if (!content) return [];
  const result: ParsedAbsatz[] = [];
  for (const child of childrenOf(content)) {
    if (tagName(child) !== "P") continue;
    const text = tidy(renderInline(childrenOf(child)));
    if (!text) continue;
    const n = text.match(/^\((\d+[a-z]?)\)/)?.[1] ?? null;
    result.push({ n, text, repealed: WEGGEFALLEN.test(text) });
  }
  return result;
}

// ------------------------------------------------------------- main

export function parseGiiLaw(xml: string, options: { slug: string; includeSections?: string[] }): ParsedLaw {
  const tree = parser.parse(xml) as Node[];
  const dokumente = find(tree, "dokumente");
  if (!dokumente) throw new Error("Not a gesetze-im-internet document: <dokumente> root missing");
  const docAttrs = attrs(dokumente);
  const norms = findAll(childrenOf(dokumente), "norm");
  if (norms.length === 0) throw new Error("No <norm> elements found");

  const header = norms[0];
  const headerMeta = childrenOf(find(childrenOf(header), "metadaten") ?? {});
  const abbrev = collapse(plainText(find(headerMeta, "amtabk"))) || collapse(plainText(find(headerMeta, "jurabk")));
  const title = collapse(plainText(find(headerMeta, "langue"))) || collapse(plainText(find(headerMeta, "kurzue"))) || abbrev;
  const standangabe = find(headerMeta, "standangabe");
  const stand = standangabe ? collapse(plainText(find(childrenOf(standangabe), "standkommentar"))) || null : null;

  const include = options.includeSections ? new Set(options.includeSections.map((s) => s.toLowerCase())) : null;
  const sections: ParsedSection[] = [];

  for (const norm of norms.slice(1)) {
    const meta = childrenOf(find(childrenOf(norm), "metadaten") ?? {});
    const enbez = collapse(plainText(find(meta, "enbez")));
    if (!enbez) continue; // table of contents / structural norms
    const { key, repealedGroup } = sectionKeyFromEnbez(enbez);
    if (include && !include.has(key)) continue;

    const sectionTitle = collapse(plainText(find(meta, "titel"))) || null;
    const textdaten = find(childrenOf(norm), "textdaten");
    const content = textdaten ? find(childrenOf(find(childrenOf(textdaten), "text") ?? {}), "Content") : undefined;
    const absaetze = parseAbsaetze(content);
    const footnoteNode = textdaten ? find(childrenOf(textdaten), "fussnoten") : undefined;
    const footnotes = footnoteNode ? tidy(renderInline(childrenOf(footnoteNode))) || null : null;

    const titleRepealed = sectionTitle !== null && WEGGEFALLEN.test(sectionTitle);
    const repealed = repealedGroup || titleRepealed || (absaetze.length > 0 && absaetze.every((a) => a.repealed));
    const text = absaetze.length > 0 ? absaetze.map((a) => a.text).join("\n\n") : repealed ? "(weggefallen)" : "";

    sections.push({
      sectionKey: key,
      sectionRef: sectionRefFromEnbez(enbez, abbrev),
      enbez,
      title: sectionTitle && !titleRepealed ? sectionTitle : null,
      text,
      url: sectionUrl(options.slug, key, repealedGroup),
      absaetze,
      repealed,
      footnotes,
    });
  }

  return {
    law: {
      abbrev,
      title,
      stand,
      standDate: standDateFromKommentar(stand),
      builddate: docAttrs.builddate ?? null,
      doknr: docAttrs.doknr ?? null,
    },
    sections,
  };
}
