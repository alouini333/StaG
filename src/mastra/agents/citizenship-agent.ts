import { Agent } from "@mastra/core/agent";
import { UnicodeNormalizer } from "@mastra/core/processors";
import { getPool } from "../../db/pool";
import { getIndexStatus, type IndexStatus } from "../../retrieval/search";
import { chatModel } from "../config/models";
import { CitationGuard } from "../processors/citation-guard";
import { lookupStatute } from "../tools/lookup-statute";
import { searchCitizenshipSources } from "../tools/search-citizenship-sources";
import { buildInstructions } from "./instructions";

let cachedStatus: { value: IndexStatus | null; at: number } = { value: null, at: 0 };
const STATUS_TTL_MS = 60_000;

/** Index status for the live part of the instructions, cached for a minute; never throws. */
export async function currentIndexStatus(): Promise<IndexStatus | null> {
  if (Date.now() - cachedStatus.at < STATUS_TTL_MS) return cachedStatus.value;
  try {
    cachedStatus = { value: await getIndexStatus(getPool("runtime")), at: Date.now() };
  } catch (error) {
    console.error("[agent] index status unavailable", error);
    cachedStatus = { value: null, at: Date.now() };
  }
  return cachedStatus.value;
}

export const citizenshipAgent = new Agent({
  id: "citizenshipAgent",
  name: "German citizenship assistant",
  description:
    "Answers questions about German citizenship and naturalisation (Staatsangehörigkeit / Einbürgerung) in German or English, grounded in current law and official sources with citations.",
  instructions: async () => buildInstructions({ indexStatus: await currentIndexStatus() }),
  model: chatModel,
  tools: { searchCitizenshipSources, lookupStatute },
  inputProcessors: [new UnicodeNormalizer()],
  outputProcessors: [new CitationGuard()],
  defaultOptions: { maxSteps: 6 },
});
