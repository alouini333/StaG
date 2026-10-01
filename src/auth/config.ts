import { env } from "../env";

/**
 * Auth variables are optional in the schema so that CLI scripts (ingestion,
 * evals) do not need them; the web app requires them at runtime.
 */
export function getAuthConfig(): { password: string; secret: string } {
  if (!env.APP_PASSWORD || !env.AUTH_SECRET) {
    throw new Error("APP_PASSWORD and AUTH_SECRET must be set for the web app (see .env.example)");
  }
  if (env.AUTH_SECRET.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters (e.g. `openssl rand -base64 32`)");
  }
  return { password: env.APP_PASSWORD, secret: env.AUTH_SECRET };
}
