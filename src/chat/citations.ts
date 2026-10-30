/**
 * Citation discipline shared by the server-side CitationGuard processor and the
 * client (which applies it to streamed text). Pure functions, no dependencies.
 */
export const CITATION_MARKER = /\[((?:S\d+|L-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*))\]/g;
const URL_PATTERN = /https?:\/\/[^\s)\]>"']+/g;

export type CitationAllowlist = { validIds: Set<string>; validUrls: Set<string> };

export function normaliseUrl(url: string): string {
  return url.replace(/[.,;:!?]+$/, "").replace(/\/$/, "").toLowerCase();
}

/** Collects citation ids and URLs from tool outputs (search results, statute lookups). */
export function allowlistFromToolOutputs(outputs: unknown[]): CitationAllowlist {
  const validIds = new Set<string>();
  const validUrls = new Set<string>();
  const visit = (value: unknown, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 6) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.citationId === "string") validIds.add(record.citationId);
    for (const key of ["url", "permalink", "bgblUrl"]) {
      if (typeof record[key] === "string") validUrls.add(normaliseUrl(record[key] as string));
    }
    for (const nested of Object.values(record)) visit(nested, depth + 1);
  };
  for (const output of outputs) visit(output);
  return { validIds, validUrls };
}

export type SanitizeReport = { text: string; removedIds: string[]; removedUrls: string[] };

/**
 * Removes citation markers that were never returned by a tool and replaces raw
 * URLs that are not among the retrieved sources. Known URLs are kept.
 */
export function sanitizeCitations(text: string, allow: CitationAllowlist): SanitizeReport {
  const removedIds: string[] = [];
  const removedUrls: string[] = [];
  let out = text.replace(CITATION_MARKER, (match, id: string) => {
    if (allow.validIds.has(id)) return match;
    removedIds.push(id);
    return "";
  });
  out = out.replace(URL_PATTERN, (url) => {
    if (allow.validUrls.has(normaliseUrl(url))) return url;
    removedUrls.push(url);
    return "[Link entfernt / link removed]";
  });
  // tidy up doubled spaces left behind by removed markers
  out = out.replace(/[ \t]{2,}/g, " ").replace(/ ([.,;:!?])/g, "$1");
  return { text: out, removedIds, removedUrls };
}
