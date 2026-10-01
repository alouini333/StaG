-- pgvector. Supabase installs extensions into the `extensions` schema, which is
-- on the default search_path of the `postgres` role. Mastra's PgVector detects
-- the extension's schema and qualifies the vector type accordingly.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
