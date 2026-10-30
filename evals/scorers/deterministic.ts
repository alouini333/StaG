/**
 * Deterministic scorers over an agent run: no model calls, pure functions,
 * unit-tested. Each returns a score in [0, 1] and a short reason.
 */
import { allowlistFromToolOutputs, CITATION_MARKER } from "../../src/chat/citations";

export type EvalRun = {
  text: string;
  toolOutputs: unknown[];
  toolNames: string[];
};

export type Expectations = {
  mustCiteTiers?: number[];
  mustCiteAny?: boolean;
  noCitations?: boolean;
  expectedSectionRefs?: string[];
  mustAskClarification?: boolean;
  mustMentionStand?: boolean;
  mustLabelOutdated?: boolean;
  forbiddenPhrases?: string[];
  expectLandMarker?: string;
  mustUseTools?: string[];
  offTopicDecline?: boolean;
  noCommunityAsFact?: boolean;
};

export type ScoreResult = { score: number; reason: string };

const DE_WORDS = ["und", "nicht", "sie", "ich", "ist", "der", "die", "das", "eine", "einen", "für", "mit", "nach", "wenn", "auch", "bitte", "werden"];
const EN_WORDS = ["and", "not", "you", "the", "is", "are", "with", "for", "your", "please", "can", "which", "that", "this", "have"];

const words = (t: string) => t.toLowerCase().replace(/[^a-zäöüß\s]/g, " ").split(/\s+/).filter(Boolean);

export function detectLanguage(text: string): "de" | "en" | "unknown" {
  const ws = words(text);
  const de = ws.filter((w) => DE_WORDS.includes(w)).length;
  const en = ws.filter((w) => EN_WORDS.includes(w)).length;
  if (de === 0 && en === 0) return "unknown";
  return de >= en ? "de" : "en";
}

export function languageMatch(run: EvalRun, lang: "de" | "en"): ScoreResult {
  const detected = detectLanguage(run.text);
  return detected === lang ? { score: 1, reason: `answer is ${lang}` } : { score: 0, reason: `expected ${lang}, detected ${detected}` };
}

export function citationValidity(run: EvalRun, exp: Expectations): ScoreResult {
  const allow = allowlistFromToolOutputs(run.toolOutputs);
  const ids = [...run.text.matchAll(CITATION_MARKER)].map((m) => m[1]);
  if (exp.noCitations) return ids.length === 0 ? { score: 1, reason: "no citations, as expected" } : { score: 0, reason: `unexpected citations ${ids.join(",")}` };
  const invalid = ids.filter((id) => !allow.validIds.has(id));
  if (invalid.length) return { score: 0, reason: `unknown citation ids ${[...new Set(invalid)].join(",")}` };
  if ((exp.mustCiteAny || exp.mustCiteTiers?.length) && ids.length === 0) return { score: 0, reason: "substantive answer without citations" };
  return { score: 1, reason: `${ids.length} valid citations` };
}

export function noRawUrls(run: EvalRun): ScoreResult {
  const urls = run.text.match(/https?:\/\/\S+/g) ?? [];
  return urls.length === 0 ? { score: 1, reason: "no urls" } : { score: 0, reason: `urls in answer: ${urls.slice(0, 2).join(" ")}` };
}

type Cited = { citationId: string; tier?: number; sectionRef?: string; jurisdictionScope?: string; lawAbbrev?: string };

export function citedResults(run: EvalRun): Cited[] {
  const out: Cited[] = [];
  const ids = new Set([...run.text.matchAll(CITATION_MARKER)].map((m) => m[1]));
  const visit = (v: unknown, depth = 0) => {
    if (!v || typeof v !== "object" || depth > 6) return;
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    const r = v as Record<string, unknown>;
    if (typeof r.citationId === "string") {
      const tier = typeof r.tier === "number" ? r.tier : r.citationId.startsWith("L-") ? 1 : undefined;
      out.push({ citationId: r.citationId, tier, sectionRef: r.sectionRef as string | undefined, jurisdictionScope: r.jurisdictionScope as string | undefined });
    }
    Object.values(r).forEach((x) => visit(x, depth + 1));
  };
  run.toolOutputs.forEach((o) => visit(o));
  return out.filter((c) => ids.has(c.citationId));
}

export function tierUsage(run: EvalRun, exp: Expectations): ScoreResult {
  if (!exp.mustCiteTiers?.length) return { score: 1, reason: "no tier requirement" };
  const tiers = new Set(citedResults(run).map((c) => c.tier));
  const missing = exp.mustCiteTiers.filter((t) => !tiers.has(t));
  return missing.length === 0 ? { score: 1, reason: `cited tiers ${[...tiers].join(",")}` } : { score: 0, reason: `missing tier(s) ${missing.join(",")}; cited ${[...tiers].join(",") || "none"}` };
}

export function sectionRefs(run: EvalRun, exp: Expectations): ScoreResult {
  if (!exp.expectedSectionRefs?.length) return { score: 1, reason: "no section requirement" };
  const refs = citedResults(run).map((c) => c.sectionRef ?? "").join(" | ") + " " + run.text;
  const hit = exp.expectedSectionRefs.filter((s) => refs.includes(s));
  const score = hit.length / exp.expectedSectionRefs.length;
  return { score, reason: `found ${hit.join(", ") || "none"} of ${exp.expectedSectionRefs.join(", ")}` };
}

export function clarification(run: EvalRun, exp: Expectations): ScoreResult {
  if (exp.mustAskClarification === undefined) return { score: 1, reason: "n/a" };
  const asks = /\?\s*$/m.test(run.text) || /(seit wie|welche[nr]?|wie lange|sind sie|haben sie|could you|do you|how long|which|what is your)[^.?!]{0,80}\?/i.test(run.text);
  return asks === exp.mustAskClarification ? { score: 1, reason: asks ? "asks a question" : "no question, as expected" } : { score: 0, reason: asks ? "asked although not expected" : "did not ask for missing facts" };
}

export function standMention(run: EvalRun, exp: Expectations): ScoreResult {
  if (!exp.mustMentionStand) return { score: 1, reason: "n/a" };
  const ok = /(Stand|zuletzt geändert|last (updated|changed|ingested)|as of|aktualisiert|\b20\d\d-\d\d-\d\d\b|\b\d{1,2}\.\s?\d{1,2}\.\s?20\d\d\b)/i.test(run.text);
  return ok ? { score: 1, reason: "mentions a date/Stand" } : { score: 0, reason: "no Stand or date mentioned" };
}

export function outdatedLabelling(run: EvalRun, exp: Expectations): ScoreResult {
  if (!exp.mustLabelOutdated) return { score: 1, reason: "n/a" };
  const ok = /(weggefallen|aufgehoben|abgeschafft|gestrichen|veraltet|nicht mehr|frühere (Regelung|Fassung)|repealed|abolished|no longer|former (rule|version)|outdated|removed in)/i.test(run.text);
  return ok ? { score: 1, reason: "labels the old rule as repealed/outdated" } : { score: 0, reason: "does not say the rule is repealed/outdated" };
}

export function forbiddenPhrases(run: EvalRun, exp: Expectations): ScoreResult {
  const hits = (exp.forbiddenPhrases ?? []).filter((p) => run.text.toLowerCase().includes(p.toLowerCase()));
  return hits.length === 0 ? { score: 1, reason: "no forbidden phrases" } : { score: 0, reason: `contains ${hits.join(", ")}` };
}

export function landMarker(run: EvalRun, exp: Expectations): ScoreResult {
  if (!exp.expectLandMarker) return { score: 1, reason: "n/a" };
  const ok = run.text.includes(exp.expectLandMarker) || citedResults(run).some((c) => c.jurisdictionScope === exp.expectLandMarker);
  return ok ? { score: 1, reason: `mentions ${exp.expectLandMarker}` } : { score: 0, reason: `no ${exp.expectLandMarker} marker` };
}

export function toolUsage(run: EvalRun, exp: Expectations): ScoreResult {
  if (!exp.mustUseTools?.length) return { score: 1, reason: "n/a" };
  const missing = exp.mustUseTools.filter((t) => !run.toolNames.includes(t));
  return missing.length === 0 ? { score: 1, reason: `used ${exp.mustUseTools.join(",")}` } : { score: 0, reason: `did not call ${missing.join(",")}` };
}

export function offTopicDecline(run: EvalRun, exp: Expectations): ScoreResult {
  if (!exp.offTopicDecline) return { score: 1, reason: "n/a" };
  const declined = /(decline|cannot help|can't help|only (help|answer)|limited to|beschränkt|nur (bei|zu) Fragen|kann ich (dir|Ihnen) (leider )?nicht|außerhalb|not able to)/i.test(run.text) && run.toolNames.length === 0;
  return declined ? { score: 1, reason: "declined without tools" } : { score: 0, reason: `did not decline cleanly (tools: ${run.toolNames.join(",") || "none"})` };
}

export function communityNotAsFact(run: EvalRun, exp: Expectations): ScoreResult {
  if (!exp.noCommunityAsFact) return { score: 1, reason: "n/a" };
  const asFact = /(takes|dauert) (exactly|genau|immer|always)/i.test(run.text);
  const hedged = /(vary|varies|unterschiedlich|depends|abhängig|no (fixed|binding)|keine (feste|verbindliche)|report|berichten)/i.test(run.text);
  return !asFact && hedged ? { score: 1, reason: "hedged, no fixed duration" } : { score: 0, reason: asFact ? "states a fixed duration" : "no hedging found" };
}

export const DETERMINISTIC: Record<string, (run: EvalRun, exp: Expectations, lang: "de" | "en") => ScoreResult> = {
  languageMatch: (run, _exp, lang) => languageMatch(run, lang),
  citationValidity,
  noRawUrls: (run) => noRawUrls(run),
  tierUsage,
  sectionRefs,
  clarification,
  standMention,
  outdatedLabelling,
  forbiddenPhrases,
  landMarker,
  toolUsage,
  offTopicDecline,
  communityNotAsFact,
};
