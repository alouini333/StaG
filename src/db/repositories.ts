import type { QueryResult, QueryResultRow } from "pg";

/**
 * Anything with pg's `query(text, params)` — a Pool, a PoolClient or a test double.
 * Only unnamed parameterised queries are used (Supabase's transaction pooler has
 * no server-side prepared statements).
 */
export type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
};

const isoDate = (value: Date | string | null | undefined): string | null =>
  value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const isoDateTime = (value: Date | string | null | undefined): string | null =>
  value == null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString();

// ---------------------------------------------------------------- source_versions

export type SourceVersionStatus = "pending" | "updated" | "skipped" | "failed";

export type SourceVersion = {
  sourceId: string;
  sourceVersion: string | null;
  contentHash: string | null;
  stand: string | null;
  standDate: string | null;
  fetchedAt: string | null;
  lastModified: string | null;
  etag: string | null;
  builddate: string | null;
  chunkCount: number;
  status: SourceVersionStatus;
  error: string | null;
  lastCheckedAt: string | null;
  pendingUpdate: boolean;
  pendingReason: string | null;
};

type SourceVersionRow = {
  source_id: string;
  source_version: string | null;
  content_hash: string | null;
  stand: string | null;
  stand_date: Date | string | null;
  fetched_at: Date | string | null;
  last_modified: string | null;
  etag: string | null;
  builddate: string | null;
  chunk_count: number;
  status: SourceVersionStatus;
  error: string | null;
  last_checked_at: Date | string | null;
  pending_update: boolean;
  pending_reason: string | null;
};

const toSourceVersion = (r: SourceVersionRow): SourceVersion => ({
  sourceId: r.source_id,
  sourceVersion: r.source_version,
  contentHash: r.content_hash,
  stand: r.stand,
  standDate: isoDate(r.stand_date),
  fetchedAt: isoDateTime(r.fetched_at),
  lastModified: r.last_modified,
  etag: r.etag,
  builddate: r.builddate,
  chunkCount: r.chunk_count,
  status: r.status,
  error: r.error,
  lastCheckedAt: isoDateTime(r.last_checked_at),
  pendingUpdate: r.pending_update,
  pendingReason: r.pending_reason,
});

export async function getSourceVersion(db: Queryable, sourceId: string): Promise<SourceVersion | null> {
  const { rows } = await db.query<SourceVersionRow>("select * from source_versions where source_id = $1", [sourceId]);
  return rows[0] ? toSourceVersion(rows[0]) : null;
}

export async function listSourceVersions(db: Queryable): Promise<SourceVersion[]> {
  const { rows } = await db.query<SourceVersionRow>("select * from source_versions order by source_id");
  return rows.map(toSourceVersion);
}

export type UpsertSourceVersion = Partial<Omit<SourceVersion, "sourceId">> & { sourceId: string };

/** Inserts or updates; only the provided fields are written (others keep their value). */
export async function upsertSourceVersion(db: Queryable, v: UpsertSourceVersion): Promise<void> {
  await db.query(
    `insert into source_versions (source_id, source_version, content_hash, stand, stand_date, fetched_at, last_modified,
       etag, builddate, chunk_count, status, error, last_checked_at, pending_update, pending_reason, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10,0),coalesce($11,'pending'),$12,$13,coalesce($14,false),$15,now())
     on conflict (source_id) do update set
       source_version  = coalesce(excluded.source_version, source_versions.source_version),
       content_hash    = coalesce(excluded.content_hash, source_versions.content_hash),
       stand           = coalesce(excluded.stand, source_versions.stand),
       stand_date      = coalesce(excluded.stand_date, source_versions.stand_date),
       fetched_at      = coalesce(excluded.fetched_at, source_versions.fetched_at),
       last_modified   = coalesce(excluded.last_modified, source_versions.last_modified),
       etag            = coalesce(excluded.etag, source_versions.etag),
       builddate       = coalesce(excluded.builddate, source_versions.builddate),
       chunk_count     = coalesce($10, source_versions.chunk_count),
       status          = coalesce($11, source_versions.status),
       error           = $12,
       last_checked_at = coalesce(excluded.last_checked_at, source_versions.last_checked_at),
       pending_update  = coalesce($14, source_versions.pending_update),
       pending_reason  = $15,
       updated_at      = now()`,
    [
      v.sourceId,
      v.sourceVersion ?? null,
      v.contentHash ?? null,
      v.stand ?? null,
      v.standDate ?? null,
      v.fetchedAt ?? null,
      v.lastModified ?? null,
      v.etag ?? null,
      v.builddate ?? null,
      v.chunkCount ?? null,
      v.status ?? null,
      v.error ?? null,
      v.lastCheckedAt ?? null,
      v.pendingUpdate ?? null,
      v.pendingReason ?? null,
    ],
  );
}

export async function markSourcePending(db: Queryable, sourceId: string, pending: boolean, reason: string | null): Promise<void> {
  await db.query(
    `insert into source_versions (source_id, pending_update, pending_reason, last_checked_at)
     values ($1, $2, $3, now())
     on conflict (source_id) do update set pending_update = $2, pending_reason = $3, last_checked_at = now(), updated_at = now()`,
    [sourceId, pending, reason],
  );
}

// ---------------------------------------------------------------- law_versions

export type LawVersion = {
  lawAbbrev: string;
  versionId: string;
  builddate: string | null;
  stand: string | null;
  standDate: string | null;
  validFrom: string | null;
  validTo: string | null;
  isCurrent: boolean;
  sourceUrl: string | null;
  archivedAt: string | null;
};

type LawVersionRow = {
  law_abbrev: string;
  version_id: string;
  builddate: string | null;
  stand: string | null;
  stand_date: Date | string | null;
  valid_from: Date | string | null;
  valid_to: Date | string | null;
  is_current: boolean;
  source_url: string | null;
  archived_at: Date | string | null;
};

const toLawVersion = (r: LawVersionRow): LawVersion => ({
  lawAbbrev: r.law_abbrev,
  versionId: r.version_id,
  builddate: r.builddate,
  stand: r.stand,
  standDate: isoDate(r.stand_date),
  validFrom: isoDate(r.valid_from),
  validTo: isoDate(r.valid_to),
  isCurrent: r.is_current,
  sourceUrl: r.source_url,
  archivedAt: isoDateTime(r.archived_at),
});

export async function insertLawVersion(
  db: Queryable,
  v: Omit<LawVersion, "archivedAt" | "isCurrent"> & { isCurrent?: boolean },
): Promise<void> {
  await db.query(
    `insert into law_versions (law_abbrev, version_id, builddate, stand, stand_date, valid_from, valid_to, is_current, source_url)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (law_abbrev, version_id) do update set
       builddate = excluded.builddate, stand = excluded.stand, stand_date = excluded.stand_date,
       valid_from = excluded.valid_from, valid_to = excluded.valid_to, is_current = excluded.is_current,
       source_url = excluded.source_url`,
    [v.lawAbbrev, v.versionId, v.builddate, v.stand, v.standDate, v.validFrom, v.validTo, v.isCurrent ?? true, v.sourceUrl],
  );
}

export async function getCurrentLawVersion(db: Queryable, lawAbbrev: string): Promise<LawVersion | null> {
  const { rows } = await db.query<LawVersionRow>(
    "select * from law_versions where law_abbrev = $1 and is_current order by created_at desc limit 1",
    [lawAbbrev],
  );
  return rows[0] ? toLawVersion(rows[0]) : null;
}

export async function listLawVersions(db: Queryable, lawAbbrev?: string): Promise<LawVersion[]> {
  const { rows } = lawAbbrev
    ? await db.query<LawVersionRow>("select * from law_versions where law_abbrev = $1 order by created_at", [lawAbbrev])
    : await db.query<LawVersionRow>("select * from law_versions order by law_abbrev, created_at");
  return rows.map(toLawVersion);
}

/** Marks a version as superseded; its sections are kept. */
export async function archiveLawVersion(db: Queryable, lawAbbrev: string, versionId: string, validTo: string): Promise<void> {
  await db.query(
    "update law_versions set is_current = false, valid_to = $3, archived_at = now() where law_abbrev = $1 and version_id = $2",
    [lawAbbrev, versionId, validTo],
  );
}

/** Returns the version valid on `asOf` (ISO date), if archived or current. */
export async function getLawVersionAsOf(db: Queryable, lawAbbrev: string, asOf: string): Promise<LawVersion | null> {
  const { rows } = await db.query<LawVersionRow>(
    `select * from law_versions
     where law_abbrev = $1 and (valid_from is null or valid_from <= $2) and (valid_to is null or valid_to >= $2)
     order by is_current desc, valid_from desc nulls last limit 1`,
    [lawAbbrev, asOf],
  );
  return rows[0] ? toLawVersion(rows[0]) : null;
}

// ---------------------------------------------------------------- law_sections

export type LawSection = {
  lawAbbrev: string;
  versionId: string;
  sectionKey: string;
  sectionRef: string;
  title: string | null;
  text: string;
  url: string | null;
  repealed: boolean;
};

type LawSectionRow = {
  law_abbrev: string;
  version_id: string;
  section_key: string;
  section_ref: string;
  title: string | null;
  text: string;
  url: string | null;
  repealed: boolean;
};

const toLawSection = (r: LawSectionRow): LawSection => ({
  lawAbbrev: r.law_abbrev,
  versionId: r.version_id,
  sectionKey: r.section_key,
  sectionRef: r.section_ref,
  title: r.title,
  text: r.text,
  url: r.url,
  repealed: r.repealed,
});

/** Batch insert (one statement per 200 rows); re-inserting the same version is idempotent. */
export async function insertLawSections(db: Queryable, sections: LawSection[]): Promise<number> {
  let inserted = 0;
  for (let offset = 0; offset < sections.length; offset += 200) {
    const batch = sections.slice(offset, offset + 200);
    const values: unknown[] = [];
    const tuples = batch.map((s, i) => {
      values.push(s.lawAbbrev, s.versionId, s.sectionKey, s.sectionRef, s.title, s.text, s.url, s.repealed);
      const b = i * 8;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`;
    });
    await db.query(
      `insert into law_sections (law_abbrev, version_id, section_key, section_ref, title, text, url, repealed)
       values ${tuples.join(",")}
       on conflict (law_abbrev, version_id, section_key) do update set
         section_ref = excluded.section_ref, title = excluded.title, text = excluded.text, url = excluded.url, repealed = excluded.repealed`,
      values,
    );
    inserted += batch.length;
  }
  return inserted;
}

/** Current version when `versionId` is omitted. */
export async function getLawSection(
  db: Queryable,
  lawAbbrev: string,
  sectionKey: string,
  versionId?: string,
): Promise<LawSection | null> {
  const { rows } = versionId
    ? await db.query<LawSectionRow>(
        "select * from law_sections where law_abbrev = $1 and section_key = $2 and version_id = $3",
        [lawAbbrev, sectionKey, versionId],
      )
    : await db.query<LawSectionRow>(
        `select s.* from law_sections s
         join law_versions v on v.law_abbrev = s.law_abbrev and v.version_id = s.version_id
         where s.law_abbrev = $1 and s.section_key = $2 and v.is_current
         order by v.created_at desc limit 1`,
        [lawAbbrev, sectionKey],
      );
  return rows[0] ? toLawSection(rows[0]) : null;
}

export async function listLawSections(db: Queryable, lawAbbrev: string, versionId: string): Promise<LawSection[]> {
  const { rows } = await db.query<LawSectionRow>(
    "select * from law_sections where law_abbrev = $1 and version_id = $2 order by section_key",
    [lawAbbrev, versionId],
  );
  return rows.map(toLawSection);
}

export async function countLawSections(db: Queryable, lawAbbrev: string, versionId: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    "select count(*)::text as n from law_sections where law_abbrev = $1 and version_id = $2",
    [lawAbbrev, versionId],
  );
  return Number(rows[0]?.n ?? 0);
}

// ---------------------------------------------------------------- law_changes

export type LawChange = {
  id: string;
  lawAbbrev: string;
  sectionRef: string | null;
  inForceDate: string | null;
  bgblRef: string | null;
  bgblUrl: string | null;
  summaryDe: string | null;
  summaryEn: string | null;
  oldText: string | null;
  newText: string | null;
  origin: "seed" | "auto";
};

type LawChangeRow = {
  id: string;
  law_abbrev: string;
  section_ref: string | null;
  in_force_date: Date | string | null;
  bgbl_ref: string | null;
  bgbl_url: string | null;
  summary_de: string | null;
  summary_en: string | null;
  old_text: string | null;
  new_text: string | null;
  origin: "seed" | "auto";
};

const toLawChange = (r: LawChangeRow): LawChange => ({
  id: r.id,
  lawAbbrev: r.law_abbrev,
  sectionRef: r.section_ref,
  inForceDate: isoDate(r.in_force_date),
  bgblRef: r.bgbl_ref,
  bgblUrl: r.bgbl_url,
  summaryDe: r.summary_de,
  summaryEn: r.summary_en,
  oldText: r.old_text,
  newText: r.new_text,
  origin: r.origin,
});

export async function upsertLawChange(db: Queryable, c: LawChange): Promise<void> {
  await db.query(
    `insert into law_changes (id, law_abbrev, section_ref, in_force_date, bgbl_ref, bgbl_url, summary_de, summary_en, old_text, new_text, origin)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (id) do update set
       law_abbrev = excluded.law_abbrev, section_ref = excluded.section_ref, in_force_date = excluded.in_force_date,
       bgbl_ref = excluded.bgbl_ref, bgbl_url = excluded.bgbl_url, summary_de = excluded.summary_de,
       summary_en = excluded.summary_en, old_text = excluded.old_text, new_text = excluded.new_text, origin = excluded.origin`,
    [c.id, c.lawAbbrev, c.sectionRef, c.inForceDate, c.bgblRef, c.bgblUrl, c.summaryDe, c.summaryEn, c.oldText, c.newText, c.origin],
  );
}

export async function listLawChanges(db: Queryable, lawAbbrev: string, sectionRef?: string): Promise<LawChange[]> {
  const { rows } = sectionRef
    ? await db.query<LawChangeRow>(
        "select * from law_changes where law_abbrev = $1 and section_ref = $2 order by in_force_date desc nulls last",
        [lawAbbrev, sectionRef],
      )
    : await db.query<LawChangeRow>("select * from law_changes where law_abbrev = $1 order by in_force_date desc nulls last", [
        lawAbbrev,
      ]);
  return rows.map(toLawChange);
}

// ---------------------------------------------------------------- ingestion_runs

export async function startIngestionRun(db: Queryable, id: string, trigger: string): Promise<void> {
  await db.query("insert into ingestion_runs (id, trigger) values ($1, $2)", [id, trigger]);
}

export async function finishIngestionRun(db: Queryable, id: string, summary: unknown): Promise<void> {
  await db.query("update ingestion_runs set finished_at = now(), summary_json = $2::jsonb where id = $1", [
    id,
    JSON.stringify(summary),
  ]);
}

export async function getLastIngestionRun(
  db: Queryable,
): Promise<{ id: string; startedAt: string; finishedAt: string | null; trigger: string; summary: unknown } | null> {
  const { rows } = await db.query<{
    id: string;
    started_at: Date | string;
    finished_at: Date | string | null;
    trigger: string;
    summary_json: unknown;
  }>("select * from ingestion_runs order by started_at desc limit 1");
  const r = rows[0];
  return r
    ? { id: r.id, startedAt: isoDateTime(r.started_at)!, finishedAt: isoDateTime(r.finished_at), trigger: r.trigger, summary: r.summary_json }
    : null;
}

// ---------------------------------------------------------------- legislation_alerts

export type LegislationAlert = {
  id: string;
  detectedAt: string;
  source: "bgbl-rss" | "gii-toc";
  title: string;
  url: string | null;
  classification: string | null;
  reason: string | null;
  status: "new" | "reviewed" | "ignored";
};

export async function insertLegislationAlert(
  db: Queryable,
  a: Omit<LegislationAlert, "detectedAt" | "status">,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `insert into legislation_alerts (id, source, title, url, classification, reason)
     values ($1,$2,$3,$4,$5,$6) on conflict (id) do nothing`,
    [a.id, a.source, a.title, a.url, a.classification, a.reason],
  );
  return (rowCount ?? 0) > 0;
}

export async function listLegislationAlerts(db: Queryable, status?: LegislationAlert["status"]): Promise<LegislationAlert[]> {
  type Row = Omit<LegislationAlert, "detectedAt"> & { detected_at: Date | string };
  const { rows } = status
    ? await db.query<Row>("select * from legislation_alerts where status = $1 order by detected_at desc", [status])
    : await db.query<Row>("select * from legislation_alerts order by detected_at desc");
  return rows.map(({ detected_at, ...rest }) => ({ ...rest, detectedAt: isoDateTime(detected_at)! }));
}

// ---------------------------------------------------------------- community_cache

export async function getCachedCommunity<T>(db: Queryable, key: string, ttlMs: number): Promise<T | null> {
  const { rows } = await db.query<{ payload_json: T }>(
    "select payload_json from community_cache where key = $1 and fetched_at > now() - ($2::text || ' milliseconds')::interval",
    [key, String(ttlMs)],
  );
  return rows[0]?.payload_json ?? null;
}

export async function setCachedCommunity(db: Queryable, key: string, payload: unknown): Promise<void> {
  await db.query(
    `insert into community_cache (key, payload_json, fetched_at) values ($1, $2::jsonb, now())
     on conflict (key) do update set payload_json = excluded.payload_json, fetched_at = now()`,
    [key, JSON.stringify(payload)],
  );
}

export async function purgeExpiredCommunity(db: Queryable, ttlMs: number): Promise<number> {
  const { rowCount } = await db.query(
    "delete from community_cache where fetched_at <= now() - ($1::text || ' milliseconds')::interval",
    [String(ttlMs)],
  );
  return rowCount ?? 0;
}
