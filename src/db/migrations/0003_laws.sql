-- Law versions are never deleted: a new consolidated text archives the previous one.
create table if not exists law_versions (
  law_abbrev   text not null,
  version_id   text not null,
  builddate    text,
  stand        text,
  stand_date   date,
  valid_from   date,
  valid_to     date,
  is_current   boolean not null default true,
  source_url   text,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  primary key (law_abbrev, version_id)
);

create table if not exists law_sections (
  law_abbrev   text not null,
  version_id   text not null,
  section_key  text not null,
  section_ref  text not null,
  title        text,
  text         text not null,
  url          text,
  repealed     boolean not null default false,
  primary key (law_abbrev, version_id, section_key)
);
create index if not exists law_sections_lookup_idx on law_sections (law_abbrev, section_key);

-- Seeded (official BGBl references) and auto-detected amendments.
create table if not exists law_changes (
  id             text primary key,
  law_abbrev     text not null,
  section_ref    text,
  in_force_date  date,
  bgbl_ref       text,
  bgbl_url       text,
  summary_de     text,
  summary_en     text,
  old_text       text,
  new_text       text,
  origin         text not null check (origin in ('seed', 'auto')),
  created_at     timestamptz not null default now()
);
create index if not exists law_changes_law_idx on law_changes (law_abbrev, in_force_date);
