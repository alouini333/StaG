/**
 * Smoke test: calls the agent once from the CLI and prints the reply.
 * Usage: pnpm smoke
 */
import "dotenv/config";
import { mastra } from "../src/mastra";
import { modelIds } from "../src/mastra/config/models";

async function main() {
  const agent = mastra.getAgent("citizenshipAgent");
  const prompt = process.argv.slice(2).join(" ") || "Sag in einem Satz, wer du bist.";
  const result = await agent.generate(prompt);
  console.log(`[model: ${modelIds.chat}]`);
  console.log(result.text);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
