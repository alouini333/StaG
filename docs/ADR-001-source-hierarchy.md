# ADR-001: Source hierarchy enforced in code

**Status:** accepted (2026-10-01)

## Context
The product must answer from authoritative German sources in a fixed order (law > federal authority > Land authority/institution > community) and must never let community reports override the law. Letting the language model decide which tool to call for which tier proved unreliable in early tests.

## Decision
One retrieval tool (`searchCitizenshipSources`) always searches tiers 1–3 and orders results by tier in code (`src/retrieval/hierarchy.ts`); tier 4 is reached only through a `CommunityProvider` and only when a gating matrix (intent × coverage) allows it. Provisions cited by authority pages are looked up and injected as current law text, undated or older pages are flagged `possiblyOutdated`, and split sections carry an outline of all their Absätze. Every result gets a citation id; a `CitationGuard` output processor (server) and the same sanitiser in the browser remove ids or URLs that were not returned by a tool.

## Consequences
- The model cannot invent sources or links; the UI builds the sources list from tool results.
- Adding a tier-4 provider never changes ranking of tiers 1–3.
- Thresholds live in one constant (`RETRIEVAL`) and are tuned with `pnpm query`.
