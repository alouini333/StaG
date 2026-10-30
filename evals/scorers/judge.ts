/**
 * LLM-judged faithfulness: every factual claim in the answer must be supported
 * by the excerpts the tools returned. Uses the cheap utility model with a
 * strict JSON rubric. (Mastra's prebuilt createFaithfulnessScorer can replace
 * this once its input shape is wired; the rubric is the same idea.)
 */
import { generateText } from "ai";
import { z } from "zod";
import { utilityModel } from "../../src/mastra/config/models";

const verdictSchema = z.object({
  claims: z.array(z.object({ claim: z.string(), supported: z.boolean(), evidence: z.string().optional() })),
});

export type JudgeResult = { faithfulness: number; hallucination: number; unsupported: string[]; claims: number };

function excerptsFrom(toolOutputs: unknown[]): string[] {
  const out: string[] = [];
  const visit = (v: unknown, depth = 0) => {
    if (!v || typeof v !== "object" || depth > 6) return;
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    const r = v as Record<string, unknown>;
    if (typeof r.citationId === "string" && typeof (r.excerpt ?? r.text) === "string") out.push(`[${r.citationId}] ${(r.excerpt ?? r.text) as string}`);
    Object.values(r).forEach((x) => visit(x, depth + 1));
  };
  toolOutputs.forEach((o) => visit(o));
  return out;
}

export async function judgeFaithfulness(answer: string, toolOutputs: unknown[]): Promise<JudgeResult | null> {
  const excerpts = excerptsFrom(toolOutputs);
  if (excerpts.length === 0 || answer.trim().length < 40) return null;
  const { text } = await generateText({
    model: utilityModel,
    temperature: 0,
    prompt: `You are a strict auditor of a legal-information assistant.
Extract every factual claim about German citizenship law or procedure from the ANSWER (ignore questions the assistant asks the user, disclaimers and generic advice to contact an authority).
For each claim decide whether it is supported by the EXCERPTS (a claim is supported if an excerpt states it or it follows directly from an excerpt). Be strict: a claim that goes beyond the excerpts is unsupported.
Respond with JSON only: {"claims":[{"claim":"…","supported":true|false,"evidence":"[S1] …"}]}

EXCERPTS:
${excerpts.map((e) => e.slice(0, 1500)).join("\n\n")}

ANSWER:
${answer}`,
  });
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  const parsed = verdictSchema.safeParse(JSON.parse(json));
  if (!parsed.success) return null;
  const claims = parsed.data.claims;
  if (claims.length === 0) return { faithfulness: 1, hallucination: 0, unsupported: [], claims: 0 };
  const unsupported = claims.filter((c) => !c.supported).map((c) => c.claim);
  const faithfulness = 1 - unsupported.length / claims.length;
  return { faithfulness, hallucination: 1 - faithfulness, unsupported, claims: claims.length };
}
