/**
 * Debug retrieval. Usage:
 *   pnpm query "Wie lange muss ich in Deutschland leben?" [--tier 1,2,3] [--k 8] [--historical]
 */
import "dotenv/config";
import { closePools } from "../src/db/pool";
import { vectorIndexName } from "../src/mastra/config/models";
import { embedQuery } from "../src/retrieval/embed";
import { createVectorStore } from "../src/retrieval/vector-store";
import type { ChunkMetadata } from "../src/sources/types";
import { listFlag, parseArgs } from "./_cli";

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const question = positional.join(" ").trim();
  if (!question) throw new Error('Usage: pnpm query "<question>" [--tier 1,2,3] [--k 8] [--historical]');
  const tiers = (listFlag(flags.tier) ?? ["1", "2", "3"]).map(Number);
  const topK = Number(flags.k ?? 8);
  const includeHistorical = flags.historical === true;

  const store = createVectorStore("session");
  const vector = await embedQuery(question);
  const results = await store.query({
    indexName: vectorIndexName(),
    queryVector: vector,
    topK,
    filter: includeHistorical ? { tier: { $in: tiers } } : { tier: { $in: tiers }, historical: false },
  });

  console.log(`\nQuery: ${question}\nIndex: ${vectorIndexName()}  tiers: ${tiers.join(",")}  topK: ${topK}\n`);
  results.forEach((r, i) => {
    const m = r.metadata as ChunkMetadata;
    const excerpt = ((r.document as string | undefined) ?? "").replace(/\s+/g, " ").slice(0, 200);
    console.log(`${String(i + 1).padStart(2)}. score=${r.score.toFixed(4)} tier=${m.tier} ${m.sectionRef ?? m.title}${m.historical ? " [HISTORICAL]" : ""}`);
    console.log(`    stand: ${m.stand ?? "-"} | ${m.url}`);
    if (excerpt) console.log(`    ${excerpt}…`);
  });
  await store.disconnect();
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closePools());
