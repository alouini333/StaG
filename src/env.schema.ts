/**
 * Environment schema and parser (no side effects). `src/env.ts` applies it to
 * `process.env` once at import time; tests import this module directly.
 */
import { z } from "zod";

const bool = z.stringbool().default(false);

export const envSchema = z
  .object({
    // Google Gemini
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1, "Gemini API key is required"),
    GEMINI_CHAT_MODEL: z.string().min(1).default("gemini-3.8-flash"),
    GEMINI_UTILITY_MODEL: z.string().min(1).default("gemini-3.5-flash-lite"),
    GEMINI_EMBEDDING_MODEL: z.string().min(1).default("gemini-embedding-001"),
    // pgvector indexes support at most 2000 dimensions
    EMBEDDING_DIMENSIONS: z.coerce.number().int().min(128).max(2000).default(768),

    // Supabase Postgres (required from Step 4 on)
    DATABASE_URL: z.string().min(1).optional(),
    DATABASE_URL_SESSION: z.string().min(1).optional(),
    MASTRA_DISABLE_STORAGE_INIT: bool,

    // Access control (required from Step 3 on)
    APP_PASSWORD: z.string().min(1).optional(),
    AUTH_SECRET: z.string().min(1).optional(),
    CRON_SECRET: z.string().min(1).optional(),

    // Community sources, tier 4
    COMMUNITY_PROVIDER: z.enum(["none", "notes", "reddit"]).default("none"),
    REDDIT_CLIENT_ID: z.string().min(1).optional(),
    REDDIT_CLIENT_SECRET: z.string().min(1).optional(),
    REDDIT_USER_AGENT: z.string().min(1).optional(),

    // Retrieval and safety switches
    RETRIEVAL_RERANK: bool,
    INPUT_GUARD: bool,
    STALE_AFTER_DAYS: z.coerce.number().int().min(1).default(30),
    SOURCE_FETCH_USER_AGENT: z
      .string()
      .min(1)
      .default("StaG-citizenship-assistant/0.1 (+https://github.com/alouini333/StaG)"),
  })
  .superRefine((values, ctx) => {
    if (values.COMMUNITY_PROVIDER === "reddit") {
      for (const key of ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_USER_AGENT"] as const) {
        if (!values[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when COMMUNITY_PROVIDER=reddit`,
          });
        }
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * `.env` files copied from `.env.example` contain lines like `APP_PASSWORD=`.
 * dotenv and Next.js load those as empty strings; treat them as "not set" so
 * defaults and optionality work as expected.
 */
function withoutEmptyValues(raw: Record<string, string | undefined>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim() !== "") cleaned[key] = value;
  }
  return cleaned;
}

/** Parse a raw environment object, throwing a readable error listing every problem. */
export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(withoutEmptyValues(raw));
  if (result.success) return result.data;

  const lines = result.error.issues.map((issue) => {
    const key = issue.path.join(".") || "(root)";
    return `  - ${key}: ${issue.message}`;
  });
  throw new Error(
    [
      "Invalid environment configuration. Fix the following variables (see .env.example):",
      ...lines,
    ].join("\n"),
  );
}
