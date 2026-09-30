/**
 * Server-side environment configuration, validated once at import time.
 *
 * NEVER import this module from a client component or anything that ends up in
 * the browser bundle: it exposes secrets. It is imported by server routes, the
 * Mastra instance and CLI scripts (which is why it does not use the
 * `server-only` package: that package throws when imported outside Next.js).
 */
import { parseEnv, type Env } from "./env.schema";

export type { Env };
export const env: Env = parseEnv(process.env);
