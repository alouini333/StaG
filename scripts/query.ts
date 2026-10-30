/**
 * Debug retrieval through the same hierarchical search the agent uses.
 *   pnpm query "Wie lange muss ich in Deutschland leben?" [--intent legal|procedural|experience|mixed] [--en "english query"] [--lang de|en]
 */
import "dotenv/config";
import { closePools, getPool } from "../src/db/pool";
import { createCommunityProvider } from "../src/community/provider";
import { env } from "../src/env";
import { vectorIndexName } from "../src/mastra/config/models";
import { embedQuery } from "../src/retrieval/embed";
import { searchSources } from "../src/retrieval/search";
import { createVectorStore } from "../src/retrieval/vector-store";
import { parseArgs } from "./_cli";

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const question = positional.join(" ").trim();
  if (!question) throw new Error('Usage: pnpm query "<question>" [--intent legal|procedural|experience|mixed] [--en "…"] [--lang de|en]');
  const intent = (typeof flags.intent === "string" ? flags.intent : "mixed") as "legal" | "procedural" | "experience" | "mixed";
  const lang = (typeof flags.lang === "string" ? flags.lang : "de") as "de" | "en";

  const store = createVectorStore("session");
  const result = await searchSources(
    { queryDe: question, queryEn: typeof flags.en === "string" ? flags.en : question, intent, lang },
    { store, db: getPool("session"), embed: embedQuery, community: createCommunityProvider(env.COMMUNITY_PROVIDER), indexName: vectorIndexName() },
  );

  console.log(`\nQuery: ${question}  (intent: ${intent})`);
  console.log(`Coverage: ${result.coverage} | community: ${result.communityIncluded ? "INCLUDED" : "not included"} – ${result.communityReason} (provider: ${result.communityProvider})`);
  const s = result.indexStatus;
  console.log(`Index: last ingested ${s.lastIngestedAt ?? "never"} (${s.indexAgeDays ?? "?"} days, ${s.stale ? "STALE" : "fresh"}); laws: ${s.laws.map((l) => `${l.lawAbbrev} ${l.standDate ?? "?"}`).join(", ")}\n`);
  for (const r of [...result.official, ...result.community]) {
    const flags = [r.possiblyOutdated ? "POSSIBLY OUTDATED" : "", r.historical ? "HISTORICAL" : "", r.jurisdictionScope !== "federal" ? r.jurisdictionScope : ""].filter(Boolean).join(", ");
    console.log(`[${r.citationId}] tier ${r.tier} (${r.tierLabel}) score=${r.score} ${r.sectionRef ?? r.title}${flags ? ` {${flags}}` : ""}`);
    console.log(`      ${r.stand ?? ""} | ${r.url}`);
    console.log(`      ${r.excerpt.replace(/\s+/g, " ").slice(0, 180)}…`);
  }
  await store.disconnect();
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closePools());
