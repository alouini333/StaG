"use client";

import { useEffect, useState } from "react";

type Status = { lastIngestedAt: string | null; indexAgeDays: number | null; stale: boolean; laws: Array<{ lawAbbrev: string; stand: string | null; standDate: string | null }>; pendingSources: string[] };

export function IndexStatusBanner() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    fetch("/api/index-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Status | null) => setStatus(s))
      .catch(() => setStatus(null));
  }, []);
  if (!status) return null;
  const stag = status.laws.find((l) => l.lawAbbrev === "StAG");
  return (
    <p className={`index-status${status.stale ? " warn" : ""}`}>
      Quellenstand / sources as of {status.lastIngestedAt ? status.lastIngestedAt.slice(0, 10) : "unbekannt / unknown"}
      {stag?.stand ? ` · StAG: ${stag.stand}` : ""}
      {status.stale ? " · Hinweis: Quellen möglicherweise veraltet / sources may be out of date" : ""}
      {status.pendingSources.length ? ` · Updates ausstehend / pending: ${status.pendingSources.join(", ")}` : ""}
    </p>
  );
}
