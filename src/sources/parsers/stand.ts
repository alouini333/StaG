const MONTHS: Record<string, string> = {
  januar: "01", februar: "02", märz: "03", maerz: "03", april: "04", mai: "05", juni: "06", juli: "07",
  august: "08", september: "09", oktober: "10", november: "11", dezember: "12",
  january: "01", february: "02", march: "03", may: "05", june: "06", july: "07", october: "10", december: "12",
};

export type StandInfo = { stand: string; standDate: string | null; standSource: "document" | "header" | "fetched" | "override" };

const pad = (v: string) => v.padStart(2, "0");

/** Parses "1. Mai 2025", "01.05.2025", "Mai 2025", "2025-05-01" into an ISO date. */
export function parseGermanDate(text: string): string | null {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const numeric = text.match(/\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})\b/);
  if (numeric) return `${numeric[3]}-${pad(numeric[2])}-${pad(numeric[1])}`;
  const long = text.match(/\b(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\s+(\d{4})\b/);
  if (long && MONTHS[long[2].toLowerCase()]) return `${long[3]}-${MONTHS[long[2].toLowerCase()]}-${pad(long[1])}`;
  const monthYear = text.match(/\b([A-Za-zäöüÄÖÜ]+)\s+(\d{4})\b/);
  if (monthYear && MONTHS[monthYear[1].toLowerCase()]) return `${monthYear[2]}-${MONTHS[monthYear[1].toLowerCase()]}-01`;
  return null;
}

const STAND_LINE = /(Stand|Letzte Aktualisierung|Zuletzt aktualisiert|Aktualisiert am|Last updated|As of)\s*[:：]?\s*((?:\d{1,2}\.\s?)?(?:\d{1,2}\.\s?\d{4}|[A-Za-zäöüÄÖÜ]+\s+\d{4}|\d{4}-\d{2}-\d{2}))/;

/**
 * Determines the as-of information of a document, preferring an explicit
 * "Stand:" line, then the HTTP Last-Modified header, then the fetch time.
 */
export function detectStand(params: {
  text: string;
  override?: string | null;
  lastModified?: string | null;
  fetchedAt: string;
}): StandInfo {
  if (params.override) return { stand: params.override, standDate: parseGermanDate(params.override), standSource: "override" };
  const m = params.text.match(STAND_LINE);
  if (m) {
    const date = parseGermanDate(m[2]);
    if (date) return { stand: `${m[1]}: ${m[2].trim()}`, standDate: date, standSource: "document" };
  }
  if (params.lastModified) {
    const d = new Date(params.lastModified);
    if (!Number.isNaN(d.getTime())) {
      const iso = d.toISOString().slice(0, 10);
      return { stand: `Seite zuletzt geändert: ${iso}`, standDate: iso, standSource: "header" };
    }
  }
  const iso = params.fetchedAt.slice(0, 10);
  return { stand: `Abgerufen am ${iso}`, standDate: iso, standSource: "fetched" };
}
