/**
 * Runs the golden set against the real agent (Gemini + Supabase) and scores it.
 *   pnpm eval                  # all cases, deterministic + LLM-judged faithfulness
 *   pnpm eval --no-llm         # deterministic scorers only
 *   pnpm eval --filter trap    # cases whose id contains "trap"
 *   pnpm eval --model gemini-3.8-flash   # override the chat model for this run
 * Writes evals/reports/<timestamp>.json and exits 1 when thresholds are missed.
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { closePools } from "../src/db/pool";
import { parseArgs, table } from "../scripts/_cli";
import { DETERMINISTIC, type EvalRun, type Expectations } from "./scorers/deterministic";
import { judgeFaithfulness } from "./scorers/judge";

type GoldenCase = { id: string; lang: "de" | "en"; input: string; intent: string; expectations: Expectations };

const THRESHOLDS = { deterministic: 0.9, faithfulness: 0.8 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (typeof flags.model === "string") process.env.GEMINI_CHAT_MODEL = flags.model;
  const { mastra } = await import("../src/mastra");
  const { modelIds } = await import("../src/mastra/config/models");
  const agent = mastra.getAgent("citizenshipAgent");

  const golden = JSON.parse(readFileSync(path.join(process.cwd(), "evals/golden.json"), "utf8")) as { cases: GoldenCase[] };
  const filter = typeof flags.filter === "string" ? flags.filter : null;
  const cases = golden.cases.filter((c) => !filter || c.id.includes(filter));
  const useLlm = flags["no-llm"] !== true;
  console.log(`[eval] ${cases.length} cases, model ${modelIds.chat}, judge ${useLlm ? modelIds.utility : "off"}\n`);

  const rows: Array<Record<string, unknown>> = [];
  const perScorer: Record<string, number[]> = {};
  const failures: string[] = [];

  for (const c of cases) {
    const started = Date.now();
    let run: EvalRun;
    try {
      const result = await agent.generate(c.input);
      const toolResults = result.steps.flatMap((s) => ((s as unknown as { toolResults?: Array<Record<string, unknown>> }).toolResults ?? []));
      run = {
        text: result.text,
        toolOutputs: toolResults.map((t) => t.output ?? t.result ?? t.payload ?? t),
        toolNames: [...new Set(toolResults.map((t) => String(t.toolName ?? "")).filter(Boolean))],
      };
    } catch (error) {
      run = { text: `ERROR: ${error instanceof Error ? error.message : String(error)}`, toolOutputs: [], toolNames: [] };
    }

    const scores: Record<string, { score: number; reason: string }> = {};
    for (const [name, fn] of Object.entries(DETERMINISTIC)) {
      const r = fn(run, c.expectations, c.lang);
      scores[name] = r;
      (perScorer[name] ??= []).push(r.score);
      if (r.score < 1) failures.push(`${c.id} · ${name}: ${r.reason}`);
    }
    let judge = null;
    if (useLlm && !c.expectations.offTopicDecline) {
      judge = await judgeFaithfulness(run.text, run.toolOutputs).catch(() => null);
      if (judge) {
        (perScorer.faithfulness ??= []).push(judge.faithfulness);
        if (judge.faithfulness < 1) failures.push(`${c.id} · faithfulness ${judge.faithfulness.toFixed(2)}: ${judge.unsupported.slice(0, 2).join(" | ")}`);
      }
    }
    const failed = Object.entries(scores).filter(([, r]) => r.score < 1).map(([n]) => n);
    rows.push({ case: c.id, lang: c.lang, tools: run.toolNames.join("+") || "-", failed: failed.join(",") || "ok", faithfulness: judge ? judge.faithfulness.toFixed(2) : "", ms: Date.now() - started, text: run.text, scores, judge });
    console.log(`${c.id.padEnd(24)} ${failed.length ? "FAIL " + failed.join(",") : "ok"}${judge ? ` faithfulness=${judge.faithfulness.toFixed(2)}` : ""}`);
    await sleep(1500);
  }

  const averages = Object.fromEntries(Object.entries(perScorer).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
  console.log("\n" + table(rows.map((r) => ({ case: r.case, lang: r.lang, tools: r.tools, failed: r.failed, faithfulness: r.faithfulness, ms: r.ms }))));
  console.log("\nAverages:\n" + table(Object.entries(averages).map(([scorer, avg]) => ({ scorer, average: avg.toFixed(3) }))));
  if (failures.length) console.log("\nFailures:\n- " + failures.join("\n- "));

  mkdirSync(path.join(process.cwd(), "evals/reports"), { recursive: true });
  const file = path.join(process.cwd(), "evals/reports", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ model: modelIds.chat, judge: useLlm ? modelIds.utility : null, averages, cases: rows }, null, 2));
  console.log(`\nReport: ${file}`);

  const detBelow = Object.entries(averages).filter(([k, v]) => k !== "faithfulness" && v < THRESHOLDS.deterministic);
  const faithBelow = averages.faithfulness !== undefined && averages.faithfulness < THRESHOLDS.faithfulness;
  if (detBelow.length || faithBelow) {
    console.log(`\nTHRESHOLDS MISSED: ${detBelow.map(([k, v]) => `${k}=${v.toFixed(2)}`).join(", ")}${faithBelow ? ` faithfulness=${averages.faithfulness.toFixed(2)}` : ""}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closePools());
