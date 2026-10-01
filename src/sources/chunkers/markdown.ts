import type { FetchedDocument } from "../fetchers/html-page";
import type { StandInfo } from "../parsers/stand";
import { chunkId, chunkMetadataSchema, type Chunk, type SourceDefinition } from "../types";

export type TextChunk = { text: string; heading: string | null };

const sentenceSplit = (text: string) => text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text];

/**
 * Heading-aware chunking of Markdown/plain text: blocks (paragraphs, list
 * items, headings) are packed greedily up to `maxSize` characters, oversized
 * blocks are split by sentence, and each chunk remembers the nearest preceding
 * heading. `overlap` characters of the previous chunk are prepended for context.
 */
export function chunkMarkdown(markdown: string, options: { maxSize?: number; overlap?: number } = {}): TextChunk[] {
  const maxSize = options.maxSize ?? 1200;
  const overlap = options.overlap ?? 120;
  const blocks = markdown.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

  const chunks: TextChunk[] = [];
  let heading: string | null = null;
  let current: string[] = [];
  let currentHeading: string | null = null;
  let size = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push({ text: current.join("\n\n"), heading: currentHeading });
    current = [];
    size = 0;
  };

  const push = (block: string) => {
    if (current.length > 0 && size + block.length + 2 > maxSize) flush();
    if (current.length === 0) {
      currentHeading = heading;
      const previous = chunks[chunks.length - 1];
      if (previous && overlap > 0 && !/^#{1,6}\s/.test(block)) {
        const tail = previous.text.slice(-overlap);
        const cut = tail.indexOf(" ");
        const context = cut >= 0 ? tail.slice(cut + 1) : tail;
        if (context.length > 20) {
          current.push(`… ${context}`);
          size += context.length + 4;
        }
      }
    }
    current.push(block);
    size += block.length + 2;
  };

  for (const block of blocks) {
    const h = block.match(/^(#{1,6})\s+(.+)$/m);
    if (h && block.split("\n").length === 1) {
      // A heading starts a new chunk so every chunk belongs to exactly one section.
      flush();
      heading = h[2].trim();
      push(block);
      continue;
    }
    if (block.length <= maxSize) {
      push(block);
      continue;
    }
    let piece = "";
    for (const sentence of sentenceSplit(block)) {
      if (piece.length + sentence.length > maxSize && piece) {
        push(piece.trim());
        piece = "";
      }
      piece += sentence;
    }
    if (piece.trim()) push(piece.trim());
  }
  flush();
  return chunks;
}

export type DocumentChunkInput = {
  source: SourceDefinition;
  fetched: Pick<FetchedDocument, "url" | "fetchedAt" | "contentHash">;
  title: string;
  stand: StandInfo;
  /** Markdown or plain text of the whole document. */
  text: string;
  /** Pre-split sections (e.g. AH-StAG numbering); when given, `text` is ignored. */
  sections?: Array<{ sectionRef: string; text: string }>;
  publisher: string;
  sourceVersion: string;
  startIndex: number;
  maxSize?: number;
};

/** Builds validated chunks for one page/PDF; returns the next chunk index. */
export function chunkDocument(input: DocumentChunkInput): { chunks: Chunk[]; nextIndex: number } {
  const { source } = input;
  const chunks: Chunk[] = [];
  let index = input.startIndex;

  const pieces: Array<{ text: string; heading: string | null; sectionRef?: string }> = input.sections
    ? input.sections.flatMap((s) => chunkMarkdown(s.text, { maxSize: input.maxSize ?? 1500, overlap: 0 }).map((c) => ({ ...c, sectionRef: s.sectionRef })))
    : chunkMarkdown(input.text, { maxSize: input.maxSize ?? 1200, overlap: 120 });

  for (const piece of pieces) {
    const headingPart = piece.heading && piece.heading !== input.title ? ` – ${piece.heading}` : "";
    const refPart = piece.sectionRef ? ` – ${piece.sectionRef}` : "";
    const header = `${input.title}${refPart}${headingPart} (Quelle: ${input.publisher}, ${input.stand.stand})`;
    const metadata = chunkMetadataSchema.parse({
      sourceId: source.id,
      tier: source.tier,
      kind: source.kind,
      title: input.title,
      url: input.fetched.url,
      lang: source.lang,
      jurisdictionScope: source.jurisdictionScope,
      sectionRef: piece.sectionRef,
      stand: input.stand.stand,
      standDate: input.stand.standDate ?? undefined,
      fetchedAt: input.fetched.fetchedAt,
      sourceVersion: input.sourceVersion,
      contentHash: input.fetched.contentHash,
      chunkIndex: index,
      historical: false,
    });
    chunks.push({ id: chunkId(source.id, input.sourceVersion, index), text: `${header}\n\n${piece.text}`, metadata });
    index += 1;
  }
  return { chunks, nextIndex: index };
}
