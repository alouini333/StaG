import type { SourceDefinition } from "../types";
import { politeFetch, saveRaw } from "./polite-fetch";

export type HtmlPageSource = Extract<SourceDefinition, { kind: "html-page" }>;

export type FetchedDocument = {
  url: string;
  body: Buffer;
  fetchedAt: string;
  contentHash: string;
  lastModified: string | null;
  etag: string | null;
};

export type FetchDocumentsResult = { documents: FetchedDocument[]; errors: string[] };

export function fileNameForUrl(url: string, extension: string): string {
  const u = new URL(url);
  const slug = (u.pathname + u.search).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "index";
  return `${slug}.${extension}`;
}

/** Fetches every URL of an html-page or pdf source; failures are collected, not thrown. */
export async function fetchDocuments(
  source: HtmlPageSource | Extract<SourceDefinition, { kind: "pdf" }>,
  extension: "html" | "pdf",
): Promise<FetchDocumentsResult> {
  const documents: FetchedDocument[] = [];
  const errors: string[] = [];
  for (const url of source.options.urls) {
    try {
      const result = await politeFetch(url, {
        minDelayMs: source.options.crawlDelayMs,
        cookieBootstrapUrl: source.options.cookieBootstrapUrl,
        headers: extension === "html" ? { Accept: "text/html,application/xhtml+xml", "Accept-Language": source.lang === "en" ? "en,de;q=0.7" : "de-DE,de;q=0.9" } : { Accept: "application/pdf,*/*" },
      });
      if (result.status !== 200 || !result.body) {
        errors.push(`${url}: HTTP ${result.status}`);
        continue;
      }
      await saveRaw(source.id, fileNameForUrl(url, extension), result.body);
      documents.push({ url, body: result.body, fetchedAt: result.fetchedAt, contentHash: result.contentHash!, lastModified: result.lastModified, etag: result.etag });
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { documents, errors };
}
