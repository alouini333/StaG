# Deployment (Vercel + GitHub)

The app deploys from GitHub on every push: `main` → production, any other branch → preview deployment.

**Current setup (done 2026-10-01 via the CLI):** Vercel project `stag` (team `alouini333s-projects`), connected to `github.com/alouini333/StaG`.

- Production: https://stag-lac.vercel.app (also `stag-alouini333s-projects.vercel.app`, `stag-git-main-alouini333s-projects.vercel.app`)
- Environment variables set for Production and Preview: `GOOGLE_GENERATIVE_AI_API_KEY`, `GEMINI_CHAT_MODEL`, `GEMINI_UTILITY_MODEL`, `GEMINI_EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `APP_PASSWORD`, `AUTH_SECRET` (separate random value per environment), `COMMUNITY_PROVIDER`, `STALE_AFTER_DAYS`.
- Step 4 adds `DATABASE_URL` (transaction pooler only; never put `DATABASE_URL_SESSION` on Vercel) and `MASTRA_DISABLE_STORAGE_INIT=true` to Production and Preview. Run `pnpm db:init` against the database before deploying code that needs it.
- `vercel link` wrote `.vercel/` (gitignored) and `.env.local` containing only a `VERCEL_OIDC_TOKEN` (gitignored).

## One-time setup

### Option A – Vercel CLI (no global install needed)

```bash
npx vercel login                 # opens the browser once
npx vercel link                  # "Set up and deploy?" → yes, create a NEW project named "stag", framework Next.js
npx vercel git connect           # links the GitHub remote so pushes deploy automatically
```

Then add the environment variables for **Production** and **Preview** (values are read from your local `.env`; never paste secrets into chat or commits):

```bash
for env in production preview; do
  for key in GOOGLE_GENERATIVE_AI_API_KEY GEMINI_CHAT_MODEL GEMINI_UTILITY_MODEL GEMINI_EMBEDDING_MODEL \
             EMBEDDING_DIMENSIONS APP_PASSWORD AUTH_SECRET COMMUNITY_PROVIDER STALE_AFTER_DAYS SOURCE_FETCH_USER_AGENT; do
    value=$(grep -E "^${key}=" .env | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//')
    [ -n "$value" ] && printf '%s' "$value" | npx vercel env add "$key" "$env" --force
  done
done
```

Use a different, strong `APP_PASSWORD` for production than for local development.

### Option B – Vercel dashboard

1. https://vercel.com/new → *Import Git Repository* → select `alouini333/StaG` (personal account; Hobby cannot deploy private repos owned by a GitHub organisation).
2. Framework preset: Next.js. Root directory: `/`. Build command and output: defaults.
3. Environment variables (Production and Preview): the keys listed above with your values.
4. Deploy. Production deploys follow `main`; previews follow every other branch.

## Runtime facts

- Node.js 22 is selected through `"engines": { "node": "22.x" }` in `package.json`.
- Functions run on Fluid compute; `/api/chat` declares `maxDuration = 300` (the Hobby maximum). Responses stream.
- `next.config.ts` sets `serverExternalPackages: ['@mastra/*']` as required by Mastra.
- Preview deployments share the same environment variables and (from Step 4) the same Supabase database as production.
- Vercel cron jobs (Step 12) run on the production deployment only and, on Hobby, at most once per day.

## Password gate

Every page and API route except `/login`, `/api/login` and `/api/cron/*` requires the signed `stag_session` cookie set by the login route. The cookie is HttpOnly, `Secure` in production, `SameSite=Lax`, valid 7 days. Rotate `AUTH_SECRET` to invalidate all sessions; change `APP_PASSWORD` to change the password.

## Verifying a deployment

1. Open the production URL → the login page must appear.
2. Wrong password → error; right password → chat.
3. Send a German and an English question → streamed answers in the same language.
4. `curl -i https://<url>/api/chat` without a cookie → `401`.
