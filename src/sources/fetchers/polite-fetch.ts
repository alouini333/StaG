import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../env";

export type PoliteFetchOptions = {
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  /** Conditional request: previously stored validators. */
  etag?: string | null;
  lastModified?: string | null;
  /** Minimum gap between requests to the same host (robots Crawl-delay). */
  minDelayMs?: number;
  timeoutMs?: number;
  retries?: number;
  /** Some sites (BMI) answer 400 until cookies from a first visit exist. */
  cookieBootstrapUrl?: string;
};

export type PoliteFetchResult = {
  status: number;
  body: Buffer | null;
  headers: Headers;
  notModified: boolean;
  fetchedAt: string;
  contentHash: string | null;
  etag: string | null;
  lastModified: string | null;
};

const lastRequestAt = new Map<string, number>();
const cookieJar = new Map<string, Map<string, string>>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

async function respectDelay(host: string, minDelayMs: number) {
  const last = lastRequestAt.get(host) ?? 0;
  const wait = last + minDelayMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(host, Date.now());
}

function storeCookies(host: string, response: Response) {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  if (setCookies.length === 0) return;
  const jar = cookieJar.get(host) ?? new Map<string, string>();
  for (const line of setCookies) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  cookieJar.set(host, jar);
}

function cookieHeader(host: string): string | undefined {
  const jar = cookieJar.get(host);
  if (!jar || jar.size === 0) return undefined;
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

/**
 * fetch() with a descriptive User-Agent, per-host delays, cookie bootstrap,
 * conditional requests, retries with backoff and a timeout. Never throws on
 * HTTP errors below 500 (callers decide); throws after retries on 5xx/429/network.
 */
export async function politeFetch(url: string, options: PoliteFetchOptions = {}): Promise<PoliteFetchResult> {
  const { method = "GET", minDelayMs = 2000, timeoutMs = 30_000, retries = 3, cookieBootstrapUrl } = options;
  const host = new URL(url).host;

  if (cookieBootstrapUrl && !cookieJar.has(host)) {
    await respectDelay(host, minDelayMs);
    const boot = await fetch(cookieBootstrapUrl, {
      headers: { "User-Agent": env.SOURCE_FETCH_USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    storeCookies(host, boot);
  }

  let attempt = 0;
  for (;;) {
    attempt += 1;
    await respectDelay(host, minDelayMs);
    const headers: Record<string, string> = {
      "User-Agent": env.SOURCE_FETCH_USER_AGENT,
      Accept: "*/*",
      ...options.headers,
    };
    if (options.etag) headers["If-None-Match"] = options.etag;
    if (options.lastModified) headers["If-Modified-Since"] = options.lastModified;
    const cookie = cookieHeader(host);
    if (cookie) headers.Cookie = cookie;

    let response: Response;
    try {
      response = await fetch(url, { method, headers, signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
    } catch (error) {
      if (attempt > retries) throw new Error(`Fetch failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(1000 * 2 ** (attempt - 1));
      continue;
    }
    storeCookies(host, response);

    if (response.status >= 500 || response.status === 429) {
      if (attempt > retries) throw new Error(`Fetch failed for ${url}: HTTP ${response.status}`);
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1));
      continue;
    }

    const fetchedAt = new Date().toISOString();
    const etag = response.headers.get("etag");
    const lastModified = response.headers.get("last-modified");
    if (response.status === 304) {
      return { status: 304, body: null, headers: response.headers, notModified: true, fetchedAt, contentHash: null, etag, lastModified };
    }
    const body = method === "HEAD" ? null : Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      body,
      headers: response.headers,
      notModified: false,
      fetchedAt,
      contentHash: body ? sha256(body) : null,
      etag,
      lastModified,
    };
  }
}

/** Raw download cache (gitignored): data/raw/<sourceId>/<fileName>. */
export async function saveRaw(sourceId: string, fileName: string, data: Buffer | string): Promise<string> {
  const dir = path.join(process.cwd(), "data", "raw", sourceId);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, fileName);
  await writeFile(file, data);
  return file;
}
