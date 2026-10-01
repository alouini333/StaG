-- New legislation flagged by the scheduled check (Step 12); reviewed by a human.
create table if not exists legislation_alerts (
  id              text primary key,
  detected_at     timestamptz not null default now(),
  source          text not null check (source in ('bgbl-rss', 'gii-toc')),
  title           text not null,
  url             text,
  classification  text,
  reason          text,
  status          text not null default 'new' check (status in ('new', 'reviewed', 'ignored'))
);

-- Short-lived cache for live community lookups (Step 11); purged after 48 h.
create table if not exists community_cache (
  key           text primary key,
  payload_json  jsonb not null,
  fetched_at    timestamptz not null default now()
);
