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
 * Follows up to 5 redirects manually so Set-Cookie headers of every hop are
 * captured (fetch's automatic following hides them). Cookies are sent per host.
 */
async function fetchFollowingRedirects(
  startUrl: string,
  baseHeaders: Record<string, string>,
  timeoutMs: number,
  method: "GET" | "HEAD" = "GET",
): Promise<Response> {
  let url = startUrl;
  for (let hop = 0; hop < 6; hop++) {
    const host = new URL(url).host;
    const headers = { ...baseHeaders };
    const cookie = cookieHeader(host);
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(url, { method, headers, signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    storeCookies(host, response);
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      url = new URL(location, url).toString();
      continue;
    }
    return response;
  }
  throw new Error(`Too many redirects for ${startUrl}`);
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
    // Sites like bmi.bund.de set cookies across a redirect chain (307 → cookie check → 302 → page).
    await respectDelay(host, minDelayMs);
    await fetchFollowingRedirects(cookieBootstrapUrl, { "User-Agent": env.SOURCE_FETCH_USER_AGENT, Accept: "text/html" }, timeoutMs);
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
      response = await fetchFollowingRedirects(url, headers, timeoutMs, method);
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
