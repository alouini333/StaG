import { unzipSync } from "fflate";
import type { SourceDefinition } from "../types";
import { politeFetch, saveRaw, sha256 } from "./polite-fetch";

export type GiiLawSource = Extract<SourceDefinition, { kind: "gii-law" }>;

export type GiiFetchResult =
  | { notModified: true; fetchedAt: string; lastModified: string | null; etag: string | null }
  | {
      notModified: false;
      xml: string;
      fetchedAt: string;
      contentHash: string;
      lastModified: string | null;
      etag: string | null;
      builddate: string | null;
    };

export function giiXmlZipUrl(slug: string): string {
  return `https://www.gesetze-im-internet.de/${slug}/xml.zip`;
}

/** Extracts the single `.xml` entry; throws when the archive is truncated or has no XML. */
export function extractGiiXml(zip: Buffer): string {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(zip));
  } catch (error) {
    throw new Error(`xml.zip is not a valid archive (truncated download?): ${error instanceof Error ? error.message : String(error)}`);
  }
  const xmlName = Object.keys(entries).find((name) => name.toLowerCase().endsWith(".xml"));
  if (!xmlName) throw new Error("xml.zip contains no .xml entry");
  const xml = Buffer.from(entries[xmlName]).toString("utf8");
  if (!xml.includes("<dokumente") || !xml.trim().endsWith("</dokumente>")) {
    throw new Error("XML document is incomplete (missing <dokumente> root or closing tag)");
  }
  return xml;
}

/**
 * Downloads the official XML of a law from gesetze-im-internet.de with a
 * conditional request. Retries once on a corrupt archive (the server
 * occasionally returns truncated zips). Caches the raw files under data/raw.
 */
export async function fetchGiiLaw(
  source: GiiLawSource,
  options: { etag?: string | null; lastModified?: string | null; force?: boolean } = {},
): Promise<GiiFetchResult> {
  const url = giiXmlZipUrl(source.options.slug);
  const conditional = options.force ? {} : { etag: options.etag ?? null, lastModified: options.lastModified ?? null };

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await politeFetch(url, { ...conditional, minDelayMs: 1500 });
    if (result.notModified) {
      return { notModified: true, fetchedAt: result.fetchedAt, lastModified: result.lastModified, etag: result.etag };
    }
    if (result.status !== 200 || !result.body) throw new Error(`gesetze-im-internet returned HTTP ${result.status} for ${url}`);
    try {
      const xml = extractGiiXml(result.body);
      await saveRaw(source.id, "xml.zip", result.body);
      await saveRaw(source.id, `${source.options.slug}.xml`, xml);
      const builddate = xml.match(/<dokumente[^>]*\bbuilddate="(\d+)"/)?.[1] ?? null;
      return {
        notModified: false,
        xml,
        fetchedAt: result.fetchedAt,
        contentHash: sha256(xml),
        lastModified: result.lastModified,
        etag: result.etag,
        builddate,
      };
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  throw new Error("unreachable");
}
