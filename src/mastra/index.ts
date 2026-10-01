import { Mastra } from "@mastra/core/mastra";
import { PostgresStore } from "@mastra/pg";
import { PinoLogger } from "@mastra/loggers";
import { env } from "../env";
import { getPool } from "../db/pool";
import { createVectorStore } from "../retrieval/vector-store";
import { citizenshipAgent } from "./agents/citizenship-agent";

/**
 * Storage and vectors live in Supabase Postgres. The runtime pool goes through
 * the transaction pooler. Schema creation (`init`) is done once by
 * `pnpm db:init`; on Vercel `MASTRA_DISABLE_STORAGE_INIT=true` skips it.
 */
export const storage = new PostgresStore({
  id: "stag-storage",
  pool: getPool("runtime"),
  disableInit: env.MASTRA_DISABLE_STORAGE_INIT,
});

export const mastra = new Mastra({
  agents: { citizenshipAgent },
  storage,
  vectors: { citizenship: createVectorStore("runtime") },
  logger: new PinoLogger({ name: "stag", level: "info" }),
});
