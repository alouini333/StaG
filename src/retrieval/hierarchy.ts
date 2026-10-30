import type { ChunkMetadata, Tier } from "../sources/types";
import { tierLabel } from "../sources/types";
import type { CommunityResult } from "../community/provider";

export type RetrievedChunk = { id: string; score: number; text: string; metadata: ChunkMetadata; /** Added because an authority page cites this provision. */ linkedFrom?: string };
export type Intent = "legal" | "procedural" | "experience" | "mixed";
export type Coverage = "strong" | "partial" | "none";

/**
 * Tunable constants. Scores are cosine similarities from gemini-embedding-001
 * (observed: ~0.73 for a direct hit, ~0.6 for related sections, <0.5 noise).
 * Tune with `pnpm query`.
 */
export const RETRIEVAL = {
  topKOfficial: 15,
  minScore: 0.35,
  strongScore: 0.6,
  partialScore: 0.5,
  minStrongCount: 2,
  tier1Floor: 0.5,
  tierCaps: { 1: 6, 2: 4, 3: 3 } as Record<1 | 2 | 3, number>,
  communityK: 6,
  excerptChars: 1200,
} as const;

/** Tiers 1→2→3, best score first within a tier, capped per tier; at least one tier-1 hit is kept if any clears the floor. */
export function orderOfficial(results: RetrievedChunk[], caps: Record<1 | 2 | 3, number> = RETRIEVAL.tierCaps): RetrievedChunk[] {
  const byTier: Record<1 | 2 | 3, RetrievedChunk[]> = { 1: [], 2: [], 3: [] };
  for (const r of results) {
    const tier = r.metadata.tier;
    if (tier === 1 || tier === 2 || tier === 3) byTier[tier].push(r);
  }
  const ordered: RetrievedChunk[] = [];
  for (const tier of [1, 2, 3] as const) {
    const sorted = [...byTier[tier]].sort((a, b) => b.score - a.score);
    ordered.push(...sorted.slice(0, caps[tier]));
  }
  if (!ordered.some((r) => r.metadata.tier === 1)) {
    const bestLaw = byTier[1].sort((a, b) => b.score - a.score)[0];
    if (bestLaw && bestLaw.score >= RETRIEVAL.tier1Floor) ordered.unshift(bestLaw);
  }
  return ordered;
}

const SECTION_REF = /§\s?(\d+[a-z]?)(?:\s?Abs(?:atz|\.)\s?(\d+[a-z]?))?\s+(StAG|GG|AufenthG)/g;

/** Provisions cited inside tier-2/3 excerpts, e.g. "§ 10 Abs. 3 StAG" → { law, sectionKey, paragraph }. */
export function citedProvisions(results: RetrievedChunk[], max = 4): Array<{ lawAbbrev: string; sectionKey: string; paragraph: number | null; from: string }> {
  const found = new Map<string, { lawAbbrev: string; sectionKey: string; paragraph: number | null; from: string }>();
  for (const r of results) {
    if (r.metadata.tier === 1) continue;
    for (const m of r.text.matchAll(SECTION_REF)) {
      const key = `${m[3]}|${m[1].toLowerCase()}|${m[2] ?? ""}`;
      if (!found.has(key)) found.set(key, { lawAbbrev: m[3], sectionKey: m[1].toLowerCase(), paragraph: m[2] ? Number(m[2]) : null, from: r.metadata.sectionRef ?? r.metadata.title });
      if (found.size >= max) return [...found.values()];
    }
  }
  return [...found.values()];
}

/** Drops lower-scoring duplicates of the same section/page. */
export function dedupeBySection(results: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Map<string, RetrievedChunk>();
  for (const r of [...results].sort((a, b) => b.score - a.score)) {
    const key = `${r.metadata.sourceId}|${r.metadata.sectionRef ?? r.metadata.url}|${r.metadata.versionId ?? ""}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}

export function assessCoverage(official: RetrievedChunk[]): Coverage {
  const strong = official.filter((r) => r.score >= RETRIEVAL.strongScore).length;
  if (strong >= RETRIEVAL.minStrongCount) return "strong";
  if (official.some((r) => r.score >= RETRIEVAL.partialScore)) return "partial";
  return "none";
}

/**
 * Gating matrix for tier 4. Community reports are consulted only when the user
 * asks for experiences, or when authoritative coverage is weak for a practical
 * question. Pure legal questions with strong coverage never see tier 4.
 */
export function shouldIncludeCommunity(params: { intent: Intent; coverage: Coverage }): { include: boolean; reason: string } {
  const { intent, coverage } = params;
  if (intent === "experience") return { include: true, reason: "the question asks about people's experiences" };
  if (coverage === "none") return { include: true, reason: "official sources do not cover this question" };
  if (coverage === "partial" && (intent === "procedural" || intent === "mixed")) {
    return { include: true, reason: "official sources only partly cover this practical question" };
  }
  return { include: false, reason: coverage === "strong" ? "official sources answer this question" : "legal question: community reports are not consulted" };
}

/** Tier 2–3 results whose as-of date predates the governing law's Stand are flagged (e.g. BMI FAQ vs. the 2025 repeal). */
export function flagOutdated<T extends RetrievedChunk>(
  results: T[],
  lawStandDates: Record<string, string | null | undefined>,
  defaultLaw = "StAG",
): Array<T & { possiblyOutdated: boolean }> {
  return results.map((r) => {
    const tier = r.metadata.tier;
    if (tier !== 2 && tier !== 3) return { ...r, possiblyOutdated: false };
    // Pages without any date of their own ("Abgerufen am …" = fetch date) cannot prove they are current.
    if (!r.metadata.standDate || /^Abgerufen am/i.test(r.metadata.stand ?? "")) return { ...r, possiblyOutdated: true };
    const governing = lawStandDates[r.metadata.lawAbbrev ?? defaultLaw] ?? lawStandDates[defaultLaw];
    if (!governing) return { ...r, possiblyOutdated: false };
    return { ...r, possiblyOutdated: r.metadata.standDate < governing };
  });
}

export type CitedResult = {
  citationId: string;
  tier: Tier;
  tierLabel: string;
  title: string;
  sectionRef?: string;
  url: string;
  stand?: string;
  standDate?: string;
  possiblyOutdated: boolean;
  historical: boolean;
  validFrom?: string;
  validTo?: string | null;
  jurisdictionScope: string;
  lang: "de" | "en";
  excerpt: string;
  score: number;
  community?: ChunkMetadata["community"];
};

export function toExcerpt(text: string, maxChars: number = RETRIEVAL.excerptChars): string {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.lastIndexOf(" ", maxChars);
  return `${clean.slice(0, cut > maxChars * 0.6 ? cut : maxChars)}…`;
}

/** Sequential S1..Sn: official results first (already tier-ordered), then community. */
export function assignCitationIds(
  official: Array<RetrievedChunk & { possiblyOutdated: boolean }>,
  community: CommunityResult[],
  lang: "de" | "en" = "de",
): { official: CitedResult[]; community: CitedResult[] } {
  let n = 0;
  const cite = (r: RetrievedChunk & { possiblyOutdated?: boolean }): CitedResult => {
    n += 1;
    const m = r.metadata;
    return {
      citationId: `S${n}`,
      tier: m.tier,
      tierLabel: tierLabel(m.tier, lang),
      title: m.title,
      sectionRef: m.sectionRef,
      url: m.url,
      stand: m.stand,
      standDate: m.standDate,
      possiblyOutdated: r.possiblyOutdated ?? false,
      historical: m.historical,
      validFrom: m.validFrom,
      validTo: m.validTo,
      jurisdictionScope: m.jurisdictionScope,
      lang: m.lang,
      excerpt: toExcerpt(r.text),
      score: Number(r.score.toFixed(4)),
      community: m.community,
    };
  };
  return { official: official.map(cite), community: community.map((c) => cite(c)) };
}
