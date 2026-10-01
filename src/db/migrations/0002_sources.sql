-- Per-source ingestion state and freshness signals.
create table if not exists source_versions (
  source_id        text primary key,
  source_version   text,
  content_hash     text,
  stand            text,
  stand_date       date,
  fetched_at       timestamptz,
  last_modified    text,
  etag             text,
  builddate        text,
  chunk_count      integer not null default 0,
  status           text not null default 'pending',
  error            text,
  last_checked_at  timestamptz,
  pending_update   boolean not null default false,
  pending_reason   text,
  updated_at       timestamptz not null default now()
);

create table if not exists ingestion_runs (
  id            text primary key,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  trigger       text not null,
  summary_json  jsonb
);
