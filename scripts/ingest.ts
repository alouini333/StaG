/**
 * Runs the ingestion workflow. Usage:
 *   pnpm ingest                      # all enabled sources
 *   pnpm ingest --source stag        # one source (repeatable / comma-separated)
 *   pnpm ingest --force              # re-ingest even if unchanged
 */
import "dotenv/config";
import { closePools } from "../src/db/pool";
import { mastra } from "../src/mastra";
import { createVectorStore } from "../src/retrieval/vector-store";
import { listFlag, parseArgs, table } from "./_cli";

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const sourceIds = listFlag(flags.source);
  const force = flags.force === true;

  const workflow = mastra.getWorkflow("ingestSources");
  const run = await workflow.createRun();
  const result = await run.start({ inputData: { sourceIds, force, trigger: "cli" } });

  if (result.status !== "success") {
    console.error(`[ingest] workflow ${result.status}`, "error" in result ? result.error : "");
    process.exitCode = 1;
    return;
  }
  const summary = result.result;
  console.log(`\n[ingest] run ${summary.runId} finished (${summary.startedAt} → ${summary.finishedAt})\n`);
  console.log(
    table(
      summary.perSource.map((s) => ({
        source: s.id,
        status: s.status,
        chunks: s.chunks ?? "",
        version: s.versionId ?? "",
        stand: s.stand ?? "",
        reason: s.error ?? s.reason ?? "",
      })),
    ),
  );
  if (summary.perSource.some((s) => s.status === "failed")) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([closePools(), createVectorStore("session").disconnect(), createVectorStore("runtime").disconnect()]);
  });
