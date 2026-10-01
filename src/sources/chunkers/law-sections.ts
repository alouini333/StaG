import type { ParsedLaw, ParsedSection } from "../parsers/gii-norm";
import { chunkId, chunkMetadataSchema, type Chunk, type SourceDefinition } from "../types";

export const MAX_SECTION_CHUNK_CHARS = 1800;

export type LawChunkContext = {
  source: Extract<SourceDefinition, { kind: "gii-law" }>;
  law: ParsedLaw["law"];
  fetchedAt: string;
  contentHash: string;
  /** builddate of the consolidated text; doubles as sourceVersion and versionId. */
  versionId: string;
};

function header(section: ParsedSection, law: ParsedLaw["law"]): string {
  const title = section.title ? ` – ${section.title}` : "";
  const stand = law.stand ? ` (Stand: ${law.stand})` : "";
  return `${law.abbrev} ${section.enbez.replace(/^\(XXXX\)\s*/, "")}${title}${stand}`;
}

/** Greedy grouping of whole Absätze so that no chunk exceeds the limit (a single oversized Absatz stays whole). */
export function groupAbsaetze(section: ParsedSection, limit = MAX_SECTION_CHUNK_CHARS): ParsedSection["absaetze"][] {
  const groups: ParsedSection["absaetze"][] = [];
  let current: ParsedSection["absaetze"] = [];
  let size = 0;
  for (const absatz of section.absaetze) {
    if (current.length > 0 && size + absatz.text.length + 2 > limit) {
      groups.push(current);
      current = [];
      size = 0;
    }
    current.push(absatz);
    size += absatz.text.length + 2;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * One chunk per §; long sections are split by groups of Absätze. Repealed
 * sections stay as a tiny chunk so the model can see that a provision no
 * longer exists. Metadata is validated against the schema.
 */
export function chunkLaw(parsed: ParsedLaw, ctx: LawChunkContext): Chunk[] {
  const chunks: Chunk[] = [];
  let index = 0;
  const { law, source } = ctx;

  for (const section of parsed.sections) {
    const head = header(section, law);
    const body = section.text || "(weggefallen)";
    const groups = body.length + head.length <= MAX_SECTION_CHUNK_CHARS || section.absaetze.length <= 1 ? [section.absaetze] : groupAbsaetze(section);

    for (const group of groups) {
      const text = group.length > 0 ? group.map((a) => a.text).join("\n\n") : body;
      const singleAbsatz = groups.length > 1 && group.length === 1 && group[0].n;
      const sectionRef = singleAbsatz
        ? section.sectionRef.replace(/^(§ \d+[a-z]?|Art\. \d+[a-z]?)/, (m) => `${m} Abs. ${group[0].n}`)
        : section.sectionRef;
      const metadata = chunkMetadataSchema.parse({
        sourceId: source.id,
        tier: source.tier,
        kind: "gii-law",
        title: `${law.title} (${law.abbrev})`,
        url: section.url,
        lang: source.lang,
        jurisdictionScope: source.jurisdictionScope,
        sectionRef,
        lawAbbrev: law.abbrev,
        stand: law.stand ?? undefined,
        standDate: law.standDate ?? undefined,
        fetchedAt: ctx.fetchedAt,
        sourceVersion: ctx.versionId,
        contentHash: ctx.contentHash,
        chunkIndex: index,
        versionId: ctx.versionId,
        validFrom: law.standDate ?? undefined,
        validTo: null,
        historical: false,
      });
      chunks.push({ id: chunkId(source.id, ctx.versionId, index), text: `${head}\n\n${text}`, metadata });
      index += 1;
    }
  }
  return chunks;
}
