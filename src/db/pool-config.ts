import type { PoolConfig } from "pg";

export type PoolKind = "runtime" | "session";

/**
 * Pool settings per use:
 * - `runtime`: Vercel functions through Supabase's transaction pooler (port 6543).
 *   Module-scope pool, small `max`, short idle timeout (Vercel/Supabase guidance).
 * - `session`: migrations, ingestion and GitHub Actions through the session pooler
 *   (port 5432; IPv4, supports long transactions and prepared statements).
 *
 * Pure function so it can be unit-tested without a database.
 */
export function poolConfigFor(kind: PoolKind, connectionString: string): PoolConfig {
  const base: PoolConfig = {
    connectionString,
    ssl: needsSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10_000,
    // Transaction pooling has no server-side prepared statements; node-postgres
    // only uses them when a query is given a `name`, which this project never does.
  };
  if (kind === "runtime") {
    return { ...base, max: 4, idleTimeoutMillis: 5_000, allowExitOnIdle: true };
  }
  return { ...base, max: 4, idleTimeoutMillis: 30_000 };
}

/** Hosted Postgres (Supabase) requires TLS; local databases usually do not offer it. */
export function needsSsl(connectionString: string): boolean {
  try {
    const url = new URL(connectionString);
    const host = url.hostname;
    if (url.searchParams.get("sslmode") === "disable") return false;
    return !(host === "localhost" || host === "127.0.0.1" || host === "::1");
  } catch {
    return true;
  }
}

/** Mask credentials for logs. */
export function describeConnection(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  } catch {
    return "<invalid connection string>";
  }
}
