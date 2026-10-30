# Changelog

## 0.1.0 – 2026-10-30
- Next.js 16 app with a shared-password gate, streaming chat (AI SDK v7 + Mastra), deployed to Vercel on push.
- Supabase Postgres + pgvector as the only database (Mastra storage, vector index, app tables).
- Ingestion workflow for gesetze-im-internet.de law XML (archive-aware), official HTML pages and PDFs (BMI, BVA, BAMF, Integrationsbeauftragte, einbürgerung.de, Berlin LEA), paced for the Gemini free tier.
- Hierarchical retrieval (law > federal authority > Land), outdated-page flags, injected law text for cited provisions, statute lookup, citation guard, sources UI with tier badges.
- Agent instructions without legal facts; live index status in the prompt and the UI.
- Evaluation suite (26 DE/EN golden cases, deterministic scorers, LLM-judged faithfulness).
- Hardening: chat rate limit, optional prompt-injection guard, gate-coverage test, secrets audit, CI.
- Roadmap items deferred: historical law change log (Step 10), scheduled law-change check (Step 12). Reddit/community provider dropped.
