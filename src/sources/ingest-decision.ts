export type IngestDecision = { action: "skip"; reason: string } | { action: "ingest"; reason: string };

/**
 * Decides whether a fetched source needs (re-)ingestion. Pure, unit-tested.
 * `force` always ingests; a 304 or an unchanged content hash skips.
 */
export function decideIngestion(params: {
  force: boolean;
  notModified: boolean;
  storedHash: string | null;
  newHash: string | null;
  storedVersion?: string | null;
  newVersion?: string | null;
}): IngestDecision {
  if (params.force) return { action: "ingest", reason: "forced" };
  if (params.notModified) return { action: "skip", reason: "not modified (304)" };
  if (params.storedHash && params.newHash && params.storedHash === params.newHash) {
    return { action: "skip", reason: "content hash unchanged" };
  }
  if (params.storedVersion && params.newVersion && params.storedVersion !== params.newVersion) {
    return { action: "ingest", reason: `new version ${params.newVersion} (was ${params.storedVersion})` };
  }
  return { action: "ingest", reason: params.storedHash ? "content changed" : "first ingestion" };
}
