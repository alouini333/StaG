import type { SourceItem } from "@/chat/sources";

const TIER_CLASS: Record<number, string> = { 1: "tier-law", 2: "tier-federal", 3: "tier-land", 4: "tier-community" };

function SourceRow({ source }: { source: SourceItem }) {
  const date = source.community?.createdUtc ? new Date(source.community.createdUtc * 1000).toISOString().slice(0, 10) : null;
  return (
    <li id={`cite-${source.citationId}`} className={`source ${TIER_CLASS[source.tier] ?? ""}`}>
      <span className="source-id">[{source.citationId}]</span>
      <span className="source-tier">{source.tierLabel}</span>
      <span className="source-title">
        {source.url ? (
          <a href={source.url} target="_blank" rel="noopener noreferrer">
            {source.sectionRef ? `${source.sectionRef} – ` : ""}
            {source.title}
          </a>
        ) : (
          <>{source.sectionRef ? `${source.sectionRef} – ` : ""}{source.title}</>
        )}
      </span>
      <span className="source-meta">
        {source.stand ? <span>{source.stand}</span> : null}
        {source.jurisdictionScope && source.jurisdictionScope !== "federal" ? <span className="badge badge-land">{source.jurisdictionScope}</span> : null}
        {source.possiblyOutdated ? <span className="badge badge-warn">möglicherweise veraltet / possibly outdated</span> : null}
        {source.historical ? (
          <span className="badge badge-warn">frühere Fassung / former version{source.validTo ? ` (gültig bis ${source.validTo})` : ""}</span>
        ) : null}
        {source.community ? (
          <span className="badge badge-community">
            Community-Bericht, nicht verbindlich / community-reported, not authoritative{date ? ` · ${date}` : ""}
            {source.community.score !== undefined ? ` · ${source.community.score} points` : ""}
            {source.community.flair ? ` · ${source.community.flair}` : ""}
          </span>
        ) : null}
      </span>
    </li>
  );
}

export function SourceList({
  official,
  community,
  communityIncluded,
  communityReason,
  communityError,
  retrievalError,
}: {
  official: SourceItem[];
  community: SourceItem[];
  communityIncluded: boolean;
  communityReason: string | null;
  communityError: string | null;
  retrievalError: string | null;
}) {
  if (retrievalError) {
    return <p className="sources-note warn">Quellenabruf nicht verfügbar / source retrieval unavailable ({retrievalError}).</p>;
  }
  if (official.length === 0 && community.length === 0) return null;
  return (
    <div className="sources">
      <h3>Quellen / Sources</h3>
      <ul>
        {official.map((s) => (
          <SourceRow key={s.citationId} source={s} />
        ))}
      </ul>
      {communityIncluded ? (
        <>
          <h4>Erfahrungsberichte / Community reports</h4>
          {communityReason ? <p className="sources-note">{communityReason}</p> : null}
          {communityError ? <p className="sources-note warn">Community-Suche nicht verfügbar / community search unavailable.</p> : null}
          {community.length > 0 ? (
            <ul>
              {community.map((s) => (
                <SourceRow key={s.citationId} source={s} />
              ))}
            </ul>
          ) : !communityError ? (
            <p className="sources-note">Keine Community-Quellen konfiguriert / no community sources configured.</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
