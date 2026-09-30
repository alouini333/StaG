import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { citizenshipAgent } from "./agents/citizenship-agent";

/**
 * The Mastra instance. Storage (Supabase Postgres) and vectors are added in
 * Step 4; workflows in Step 6.
 */
export const mastra = new Mastra({
  agents: { citizenshipAgent },
  logger: new PinoLogger({ name: "stag", level: "info" }),
});
