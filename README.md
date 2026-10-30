# StaG – German citizenship assistant

A small bilingual (German / English) chat assistant that answers questions about German citizenship and naturalisation (Staatsangehörigkeit / Einbürgerung). It is built as a retrieval-augmented agent: instead of trusting what a language model remembers, it looks up the current text of the law and official guidance, answers from those documents, and shows where each statement came from.

The assistant is deliberately conservative. It distinguishes what the law says, what an authority states, and what people report from their own experience. It labels outdated rules as such, points out when a source may be stale, asks for missing facts when they change the answer, and never invents citations or links.

> **Legal information, not legal advice.** German citizenship law changes (2024, 2025 and 2026 alone brought three amendments). Always confirm case-specific questions with the competent Einbürgerungsbehörde or a lawyer.

## Stack

- **TypeScript**, **Next.js 16** (App Router) – web UI and server routes
- **Mastra** – agent, tools, workflows and evals
- **Google Gemini** – chat, utility and embedding models (configurable via env)
- **Supabase Postgres + pgvector** – the only database: Mastra storage, vector index, app tables
- **Vercel** – deployment on every push; **GitHub Actions** – scheduled law-change checks and ingestion
- **pnpm** (via Corepack) and **Vitest**

## Source hierarchy

Answers are grounded in four tiers, and the retrieval code enforces the order:

1. **Gesetz / Law** – federal law from gesetze-im-internet.de (StAG, GG, AufenthG, …), archived per version
2. **Bundesbehörde / Federal authority** – BMI, BVA, BAMF, Integrationsbeauftragte, Bundesgesetzblatt
3. **Landesbehörde oder Institution / Land authority or other institution** – e.g. Berlin LEA
4. **Community (r/GermanCitizenship)** – experience reports, secondary, clearly labelled, never overriding the law

## RAG: how the agent knows what it knows

This assistant is a **retrieval-augmented** agent. The language model never answers from memory about the law; it answers from documents that were fetched from official sources, stored in a vector database, and retrieved for each question. The system prompt contains no legal facts at all (a test enforces that), so when the law changes only the data changes, not the code.

```
                    ingestion (scripts / GitHub Actions)                       question time (web app)
 ┌──────────────────────────────────────────────────────────┐    ┌────────────────────────────────────────────────┐
 │ registry of sources (tiers 1–3)                           │    │ user question (DE or EN)                        │
 │   → fetch (polite, conditional)                           │    │   → agent calls searchCitizenshipSources        │
 │   → detect change (hash / builddate; skip if unchanged)   │    │       → embed the German query                  │
 │   → parse (law XML per §, HTML → Markdown, PDF text)      │    │       → pgvector search, current versions only  │
 │   → chunk (per §/Absatz, per heading)                     │    │       → order law → authority → Land            │
 │   → embed with Gemini (768 dims)                          │    │       → flag outdated pages, inject cited law   │
 │   → upsert vector + metadata into Supabase                │    │       → community (tier 4) only if gated open   │
 │   → archive the previous law version (never delete)      │    │   → lookupStatute for exact § wording           │
 └──────────────────────────────────────────────────────────┘    │   → answer with [S1] citations in the user's    │
                                                                  │     language; CitationGuard removes anything    │
                                                                  │     not backed by a retrieved source            │
                                                                  └────────────────────────────────────────────────┘
```

**What is stored.** Each chunk is a passage of text (one § of a law, one section of an official page or PDF) plus a 768-dimensional embedding and a metadata object: source, tier, title, deep link, citation (`§ 10 Abs. 3 StAG`), the source's as-of date (`Stand`), the law version and its validity period, and whether it is historical. The text itself is stored next to the vector, so retrieval returns passages the model can quote.

**What is retrieved.** The question is embedded with the same model and compared by cosine similarity. The top passages are then re-ordered by authority rather than by score alone, deduplicated, flagged when they predate the current law, and numbered `S1…Sn`. Repealed provisions stay visible as "(weggefallen)" and split sections carry an outline of all their Absätze, so the model can see what no longer exists.

**Why this beats a static prompt.** The StAG changed three times between June 2024 and July 2026 and official FAQ pages lag behind. A scheduled job (Step 12) re-fetches the sources, re-embeds only what changed and archives previous law versions; the agent's instructions receive the live index date, and the UI shows it.

Details: [Feeding the agent](#feeding-the-agent-rag) · [Sources](#sources) · [How retrieval decides what to show](#how-retrieval-decides-what-to-show) · [How the agent answers](#how-the-agent-answers) · [RAG data model](#rag-data-model)

## Run locally

```bash
corepack enable pnpm          # or: npm install -g pnpm
pnpm install
cp .env.example .env          # fill in the values you have
pnpm dev                      # http://localhost:3000
```

Useful commands: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

Notes:
- Node 22.x is the target (see `engines` in `package.json`); Next 16 uses `proxy.ts` (not `middleware.ts`) for request interception.
- pnpm 12 blocks packages published less than 24 hours ago; the framework scopes this project tracks (`@mastra/*`, `ai`, `@ai-sdk/*`, `next`) are exempted in `pnpm-workspace.yaml`.
- `AGENTS.md` / `CLAUDE.md` were generated by `create-next-app` and are re-added by `next dev`; they only tell coding agents to read the bundled Next.js docs.

## Run the chat

```bash
pnpm dev                      # http://localhost:3000 → redirects to /login
```

Sign in with `APP_PASSWORD` from your `.env`, then ask questions in German or English. Every answer shows its sources with tier badges; `[S1]` markers link to them. Enter sends, Shift+Enter inserts a newline. "Neuer Chat" clears the history (the browser keeps the conversation and sends it with every request; there is no server-side memory yet).

### Password

The whole app is behind one shared password:

- `APP_PASSWORD` – the password everyone uses.
- `AUTH_SECRET` – at least 32 random characters (`openssl rand -base64 32`) used to sign the session cookie.

`src/proxy.ts` (Next 16's request interception file) checks the cookie on every request except `/login`, `/api/login` and `/api/cron/*`; API routes get `401`, pages are redirected to `/login`. Login attempts are rate-limited (10 per 10 minutes per IP, best effort on serverless).

### Deploy

Pushing to `main` deploys to Vercel (production: https://stag-lac.vercel.app); other branches get preview URLs. One-time project setup and the environment variable list are in [docs/deployment.md](docs/deployment.md).

## Configuration

Copy `.env.example` to `.env` and fill in what you have. Empty values (`KEY=`) are treated as "not set", so a fresh copy works with only the Gemini key.

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | yes | Gemini API key (server only; also read by Mastra's model router) |
| `GEMINI_CHAT_MODEL` | default `gemini-3.8-flash` | Conversational model of the agent |
| `GEMINI_UTILITY_MODEL` | default `gemini-3.5-flash-lite` | Reranking, classification, guards, eval judging |
| `GEMINI_EMBEDDING_MODEL` | default `gemini-embedding-001` | Embeddings for ingestion and retrieval |
| `EMBEDDING_DIMENSIONS` | default `768` | Embedding size (pgvector indexes allow ≤ 2000) |
| `DATABASE_URL`, `DATABASE_URL_SESSION` | Step 4 | Supabase transaction / session pooler URLs |
| `MASTRA_DISABLE_STORAGE_INIT` | default `false` | Skip Mastra's schema DDL at runtime (set `true` on Vercel) |
| `APP_PASSWORD`, `AUTH_SECRET` | Step 3 | Shared password and cookie-signing secret |
| `CRON_SECRET` | Step 12 | Protects `/api/cron/*` |
| `COMMUNITY_PROVIDER` | default `none` | `none`, `notes` or `reddit` (tier 4) |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` | if `reddit` | Official Reddit Data API credentials |
| `RETRIEVAL_RERANK`, `INPUT_GUARD` | default `false` | Optional reranking and prompt-injection guard |
| `STALE_AFTER_DAYS` | default `30` | Warn when the source index is older than this |
| `SOURCE_FETCH_USER_AGENT` | has default | Descriptive User-Agent for fetching official sites |

Validation lives in [`src/env.schema.ts`](src/env.schema.ts); a missing or invalid variable fails fast with a message naming it.

### Changing the model

Models are configured only through the environment and read in one place, [`src/mastra/config/models.ts`](src/mastra/config/models.ts):

- Chat or utility model: change `GEMINI_CHAT_MODEL` / `GEMINI_UTILITY_MODEL` and restart. Nothing else changes.
- Embedding model or dimensions: the vector index name encodes both (`citizenship_<model>_<dims>`), so a change creates a new, empty index. Re-ingest with `pnpm ingest --force` (Step 6) afterwards.

Current Gemini model IDs: https://ai.google.dev/gemini-api/docs/models (Google recommends `gemini-3.8-flash` or `gemini-3.5-flash-lite` for new projects; the 2.5 models are restricted to prior users).

### Mastra Studio

`pnpm mastra:dev` starts Mastra Studio at http://localhost:4111 from `src/mastra/index.ts` for inspecting agents, tools and workflow runs. It reads the same `.env` as Next.js.

### Smoke test

`pnpm smoke` calls the agent once from the CLI (`pnpm smoke "Your question"` to pass your own prompt) and prints the reply together with the model ID.

## Database (Supabase Postgres + pgvector)

One database holds everything: Mastra's storage tables, the pgvector index and the app's own tables (from Step 5).

Two connection strings, both from Supabase → *Connect*:

| Variable | Supabase pooler | Used by |
|---|---|---|
| `DATABASE_URL` | Transaction pooler, port **6543** | the web app (Vercel functions): module-scope pool, `max 4`, 5 s idle timeout |
| `DATABASE_URL_SESSION` | Session pooler, port **5432** | migrations, ingestion, GitHub Actions (IPv4; long transactions) |

Paste the strings **without** the `?sslmode=require&supa=...` suffix Supabase appends (TLS is configured in `src/db/pool-config.ts`). `DATABASE_URL_SESSION` is the same string with port 5432. Do not use the direct `db.<ref>.supabase.co` connection: it is IPv6-only on the free tier.

Commands:

```bash
pnpm db:migrate   # applies src/db/migrations/*.sql (tracked in schema_migrations); idempotent
pnpm db:init      # migrations + Mastra storage schema + HNSW vector index for the current embedding model; idempotent
```

Run `pnpm db:init` once per database (locally or in CI). The deployed app runs with `MASTRA_DISABLE_STORAGE_INIT=true`, so it never issues DDL on cold starts. `/api/health` (behind the password) reports the database round-trip time and the index status.

The vector index is named `citizenship_<embedding-model>_<dims>` (currently `citizenship_gemini_embedding_001_768`, HNSW, cosine, metadata indexes on `tier`, `sourceId`, `historical`). pgvector indexes allow at most 2,000 dimensions.

Free-tier note: Supabase pauses free projects after 7 days without activity. Check the project is active before a demo (it restores in a minute or two from the dashboard).

Local alternative for development: `docker run -d --name stag-pg -e POSTGRES_PASSWORD=stag -e POSTGRES_DB=stag -p 54329:5432 pgvector/pgvector:pg17` and point both URLs at `postgresql://postgres:stag@localhost:54329/stag`.

## Feeding the agent (RAG)

Ingestion is a Mastra workflow (`ingestSources`, visible in Studio) with three steps: resolve the requested sources → ingest each one (failures isolated per source) → write a summary row to `ingestion_runs`.

For a law (`gii-law`) the per-source pipeline is:

1. **Fetch** the official XML (`https://www.gesetze-im-internet.de/<slug>/xml.zip`) with a conditional request (`If-None-Match`/`If-Modified-Since`), a descriptive User-Agent and a per-host delay; the zip is validated and retried once (the server occasionally truncates it). Raw files are cached under `data/raw/<source>/` (gitignored).
2. **Detect change**: a 304 or an unchanged content hash ⇒ `skipped` (only `last_checked_at` is updated). `--force` ingests anyway.
3. **Parse** per `<norm>`: law header (abbreviation, title, `Stand`, `standDate`, `builddate`) and sections with key (`10`, `12a`, `art16`), citation (`§ 10 StAG`), deep link, Absätze, repealed flags (title or text `(weggefallen)`, `(XXXX) §§ 18 und 19` groups), footnotes. Enumerations are rendered as numbered lines so the text stays readable.
4. **Chunk**: one chunk per §, prefixed with `StAG § 10 (Stand: …)`; sections longer than ~1,800 characters are split by whole Absätze and cited as `§ 10 Abs. 3 StAG`. Repealed provisions stay visible as `(weggefallen)`.
5. **Embed** with the configured Gemini embedding model (task type `RETRIEVAL_DOCUMENT`, 768 dimensions), 100 texts per call with retry/backoff; vectors with the wrong dimensionality are rejected.
6. **Store**: the version is written to `law_versions` and full section texts to `law_sections`; vectors + metadata are upserted into the pgvector index. If a **previous version** exists it is archived, never deleted: `law_versions.is_current=false`, `valid_to`, and every old chunk rewritten with `historical=true`/`validTo` (PgVector's `updateVector` replaces metadata, so chunks are re-upserted with their existing vectors).
7. **Record** the result in `source_versions` (version, hash, Stand, fetch validators, chunk count, status).

Commands:

```bash
pnpm ingest                       # all enabled sources
pnpm ingest --source stag --force # one source, even if unchanged
pnpm sources:status               # per-source state, law versions, chunk counts (current + historical)
pnpm query "Wie lange muss ich in Deutschland leben?" --tier 1 --k 8   # debug retrieval (--historical to include archived versions)
```

Ingestion runs on your machine or in GitHub Actions against the Supabase session pooler; the deployed app only reads.

## Sources

All sources live in [`src/sources/registry.ts`](src/sources/registry.ts). Tier 1 = law, tier 2 = federal authorities, tier 3 = Land authorities, tier 4 = community (Step 11).

| Source id | Tier | Kind | Publisher / scope | Cadence | Notes |
|---|---|---|---|---|---|
| `stag` | 1 | law XML | gesetze-im-internet.de | 7 d | full Staatsangehörigkeitsgesetz |
| `gg` | 1 | law XML | gesetze-im-internet.de | 7 d | Art. 16, 116 only |
| `aufenthg` | 1 | law XML | gesetze-im-internet.de | 7 d | residence-title §§ (4–9c, 18c–19c, 23–30, 38a, 51) |
| `freizuegg` | 1 | law XML | gesetze-im-internet.de | 7 d | §§ 2, 4a, 5 |
| `einbtestv` | 1 | law XML | gesetze-im-internet.de | 30 d | Einbürgerungstestverordnung |
| `bgbl-2024-104`, `bgbl-2025-256`, `bgbl-2025-364`, `bgbl-2026-221` | 1 | PDF | Bundesgesetzblatt | 90 d | amending acts; crawl delay 30 s |
| `bmi-staatsangehoerigkeit-de`, `bmi-nationality-en` | 2 | HTML | BMI, federal | 14 d | cookie bootstrap, crawl delay 10 s; the reform FAQ lags behind the law |
| `bmi-ah-stag-2025` | 2 | PDF | BMI, federal | 30 d | Anwendungshinweise, Stand 1 May 2025 (before the 3-year-track repeal), split by numbering |
| `bva-staatsangehoerigkeit-de`, `bva-citizenship-en` | 2 | HTML | BVA, federal | 14 d | naturalisation from abroad, § 5 declaration, Art. 116 (2) GG, § 15, Feststellung |
| `bva-merkblaetter-de`, `bva-merkblatt-anspruch-en` | 2 | PDF | BVA, federal | 30 d | information sheets |
| `bamf-einbuergerungstest-de`, `bamf-naturalisation-test-en` | 2 | HTML | BAMF, federal | 30 d | the naturalisation test |
| `integrationsbeauftragte-einbuergerung`, `integrationsbeauftragte-broschueren` | 2 | HTML, PDF | Integrationsbeauftragte, federal | 30 d | incl. brochure "Mein Weg zum deutschen Pass" (Oct 2025) |
| `einbuergerung-de-portal-de`, `einbuergerung-de-portal-en` | 2 | HTML | Bundesregierung portal einbürgerung.de | 30 d | FAQ |
| `bamf-gesamtfragenkatalog` | 2 | PDF | BAMF | 90 d | **disabled** (9 MB test-question catalogue) |
| `berlin-lea-einbuergerung`, `berlin-service-einbuergerung` | 3 | HTML | Land Berlin (LEA) | 14 d | `jurisdictionScope: Berlin` |

Excluded on purpose: make-it-in-germany.com (bot captcha), the official English StAG translation (stale, still contains the repealed 3-year track), StAR-VwV 2000 (obsolete).

### Adding a source

1. Fetch the URL once by hand (`curl -A "<your UA>" -I <url>`) and check robots.txt for a `Crawl-delay`; note whether a cookie bootstrap is needed (BMI) and which selector holds the main content (`#content`, `main`, …).
2. Add an entry to `src/sources/registry.ts`: `id` (lowercase slug), `tier`, `kind` (`gii-law` | `html-page` | `pdf`), `title`, `publisher`, `url`, `lang`, `jurisdictionScope`, `refreshCadenceDays`, and the kind-specific `options` (law: `lawAbbrev`, `slug`, optional `includeSections`; pages/PDFs: `urls`, `contentSelector`, `cookieBootstrapUrl`, `crawlDelayMs`, `standOverride`).
3. `pnpm test` (the registry is validated: unique ids, https URLs, schema).
4. `pnpm ingest --source <id>` and inspect the result with `pnpm sources:status` and `pnpm query "…" --tier <n>`.
5. If the page has no "Stand:" line, the `Last-Modified` header or the fetch date is used as the as-of date; set `standOverride` for PDFs with a known date.

## How retrieval decides what to show

`searchCitizenshipSources` (the agent's main tool) enforces the hierarchy in code, in [`src/retrieval/search.ts`](src/retrieval/search.ts) and the pure helpers in [`src/retrieval/hierarchy.ts`](src/retrieval/hierarchy.ts):

1. Embed the German query and search current (non-historical) chunks of tiers 1–3 (top 15, cosine ≥ 0.35).
2. Order **law → federal authority → Land/institution**, best score first within a tier, capped at 6/4/3.
3. **Law next to the page that cites it:** every provision cited in a tier-2/3 excerpt (`§ 10 Abs. 3 StAG`) is pulled from `law_sections` and added as a tier-1 result "(aktuelle Fassung)", so a FAQ describing a repealed rule always appears beside the current text, e.g. "(3) (weggefallen)".
4. Flag tier-2/3 results as **possibly outdated** when their as-of date is older than the governing law's Stand, or when the page has no date of its own.
5. Assess coverage: *strong* (≥ 2 hits ≥ 0.60), *partial* (≥ 1 hit ≥ 0.50), *none*.
6. Consult tier 4 (community) only when the gate opens:

| intent \ coverage | strong | partial | none |
|---|---|---|---|
| legal | no | no | yes |
| procedural | no | yes | yes |
| mixed | no | yes | yes |
| experience | yes | yes | yes |

7. Assign citation ids `S1…Sn` (official first, community after) and attach the index status (last ingestion, age, per-law Stand, pending updates).

`lookupStatute` returns the exact current text of a § or Absatz (`[L-StAG-10-3]`), marking repealed provisions. `pnpm query "<question>" --intent legal|procedural|experience|mixed` runs the same pipeline from the CLI and prints coverage, gating reason and flags; use it to tune the thresholds in `RETRIEVAL`.

## How the agent answers

```
user message → Next.js /api/chat (password cookie required)
  → Mastra agent (instructions = policy + live index status; no legal facts in the prompt)
     → UnicodeNormalizer (input)
     → searchCitizenshipSources (always) · lookupStatute (when a § is named)
     → Gemini writes the answer in the user's language, labelling "the law says / the authority states / people report",
       citing [S1] ids only, asking for missing facts, never writing URLs
     → CitationGuard (output): drops ids not returned by tools and URLs not among the sources
  → streamed to the browser; the UI builds the sources list from the tool results, renders [S1] as links,
    shows tier badges, "possibly outdated", "former version", Land and community markers, and the index-status banner
```

## RAG data model

Everything the agent retrieves is a **chunk**: a piece of text with a vector and a metadata object. The metadata is what makes citations, tier ranking, freshness and the old-law feature possible.

**Sources** are declared in [`src/sources/registry.ts`](src/sources/registry.ts) and validated by zod at import time ([`src/sources/types.ts`](src/sources/types.ts)). Each has an `id` (slug), a `tier`, a `kind` (`gii-law`, `html-page`, `pdf`, `community-notes`, `law-change-seed`), a `jurisdictionScope` (`federal` or a Land) and kind-specific options (law abbreviation and gesetze-im-internet slug, page URLs and selectors, …). Reddit is not a source here: it is a live provider (Step 11).

**Chunk metadata** (`chunkMetadataSchema`): `sourceId`, `tier`, `kind`, `title`, `url` (deep link), `lang`, `jurisdictionScope`, `sectionRef` (e.g. `§ 10 Abs. 3 StAG`), `lawAbbrev`, `stand` + `standDate` (as-of date of the source), `fetchedAt`, `sourceVersion`, `contentHash`, `chunkIndex`, and for laws `versionId`, `validFrom`, `validTo`, `historical`. Rules enforced by the schema: tier-4 chunks need `community` metadata, law chunks need `sectionRef`/`lawAbbrev`, `validTo` cannot precede `validFrom`, and historical chunks must have a `validTo`.

**Chunk IDs** are deterministic: `<sourceId>::<sourceVersion>::<chunkIndex>`. Re-ingesting an unchanged source rewrites the same IDs; a new source version gets new IDs, so old chunks can be archived (laws) or deleted by `sourceId` filter (pages).

**App tables** (SQL migrations in `src/db/migrations/`, typed access in [`src/db/repositories.ts`](src/db/repositories.ts)):

| Table | Purpose |
|---|---|
| `source_versions` | Per-source ingestion state: version, hash, Stand, fetch headers, chunk count, status, pending-update flag |
| `law_versions` | Every consolidated law version ever ingested, with validity range; never deleted |
| `law_sections` | Full text per § and version, for exact lookups and as-of queries |
| `law_changes` | Amendments (seeded from BGBl references or auto-detected), used for "this rule is outdated" answers |
| `ingestion_runs` | Audit log of ingestion runs |
| `legislation_alerts` | New legislation flagged by the scheduled check, awaiting review |
| `community_cache` | Short-lived cache for live community lookups (purged after 48 h) |

The vector index name encodes the embedding model and dimensions (`citizenship_gemini_embedding_001_768`), so changing either forces a clean re-index.

Integration tests for the repositories run against a throwaway schema when `TEST_DATABASE_URL` is set (for example the local pgvector container); otherwise they are skipped.

## Roadmap

- [x] Step 1 – Git repository, GitHub remote and project structure
- [x] Step 2 – Mastra + Gemini wiring, validated env, configurable models
- [x] Step 3 – Streaming chat route, minimal UI, password gate, Vercel deploy on push
- [x] Step 4 – Supabase Postgres + pgvector: Mastra storage/vectors, pools, migrations
- [x] Step 5 – Source registry, tiers, chunk metadata (with validity fields), app tables
- [x] Step 6 – Tier 1: law ingestion from gesetze-im-internet XML (archive-aware)
- [x] Step 7 – Tiers 1–3 expansion: more laws, official pages, PDFs
- [x] Step 8 – Retrieval tools with code-enforced hierarchy
- [x] Step 9 – Agent v1: instructions, tools, CitationGuard, sources UI
- [ ] Step 10 – Historical law versions and outdated-rule awareness
- [ ] Step 11 – Tier 4 community providers (curated notes, live Reddit)
- [ ] Step 12 – Scheduled law-change check and ingestion, new-legislation alerts
- [ ] Step 13 – Evaluation suite
- [ ] Step 14 – Hardening, deployment audit, release v0.1.0
