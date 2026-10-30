import { z } from "zod";

/** Authority tiers. Lower is more authoritative; retrieval enforces the order in code. */
export const TIERS = [1, 2, 3, 4] as const;
export type Tier = (typeof TIERS)[number];
export const tierSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

const TIER_LABELS: Record<Tier, { de: string; en: string }> = {
  1: { de: "Gesetz", en: "Law" },
  2: { de: "Bundesbehörde", en: "Federal authority" },
  3: { de: "Landesbehörde oder Institution", en: "Land authority or other institution" },
  4: { de: "Community – Erfahrungsberichte (nicht verbindlich)", en: "Community – reported experiences (not authoritative)" },
};

export function tierLabel(tier: Tier, lang: "de" | "en" = "de"): string {
  return TIER_LABELS[tier][lang];
}

export const langSchema = z.enum(["de", "en"]);
export type Lang = z.infer<typeof langSchema>;

/** 'federal' or the name of a Land (e.g. "Berlin"). */
export const jurisdictionScopeSchema = z.string().min(1).default("federal");

export const sourceKindSchema = z.enum(["gii-law", "html-page", "pdf", "community-notes", "law-change-seed"]);
export type SourceKind = z.infer<typeof sourceKindSchema>;

const sourceBase = {
  /** Stable slug used in chunk IDs, metadata and the source_versions table. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "source id must be a lowercase slug"),
  tier: tierSchema,
  title: z.string().min(1),
  /** Issuing body shown in chunk headers and citations, e.g. "Bundesverwaltungsamt (BVA)". Defaults to the title. */
  publisher: z.string().min(1).optional(),
  url: z.url(),
  lang: langSchema,
  jurisdictionScope: jurisdictionScopeSchema,
  enabled: z.boolean().default(true),
  refreshCadenceDays: z.number().int().min(1).default(14),
  notes: z.string().optional(),
};

export const sourceDefinitionSchema = z.discriminatedUnion("kind", [
  z.object({
    ...sourceBase,
    kind: z.literal("gii-law"),
    options: z.object({
      /** Official abbreviation, e.g. "StAG", "GG", "AufenthG". */
      lawAbbrev: z.string().min(1),
      /** Folder slug on gesetze-im-internet.de, e.g. "stag", "aufenthg_2004". */
      slug: z.string().regex(/^[a-z0-9_]+$/),
      /** Only ingest these section keys (e.g. ["16", "116"] for GG articles). */
      includeSections: z.array(z.string().min(1)).optional(),
    }),
  }),
  z.object({
    ...sourceBase,
    kind: z.literal("html-page"),
    options: z.object({
      urls: z.array(z.url()).min(1),
      /** CSS selector of the main content; readability fallback when it matches nothing. */
      contentSelector: z.string().min(1).optional(),
      /** Some sites (BMI) require a cookie set by a first visit to this URL. */
      cookieBootstrapUrl: z.url().optional(),
      crawlDelayMs: z.number().int().min(0).default(2000),
    }),
  }),
  z.object({
    ...sourceBase,
    kind: z.literal("pdf"),
    options: z.object({
      urls: z.array(z.url()).min(1),
      /** Used when the PDF has no detectable "Stand:" line. */
      standOverride: z.string().min(1).optional(),
      /** Section-numbering style for sectionRef detection ("ah-stag": "10.1.1" → "AH-StAG 2025 Nr. 10.1.1"). */
      sectionNumbering: z.enum(["ah-stag"]).optional(),
      cookieBootstrapUrl: z.url().optional(),
      crawlDelayMs: z.number().int().min(0).default(2000),
    }),
  }),
  z.object({
    ...sourceBase,
    kind: z.literal("community-notes"),
    options: z.object({
      /** Glob of hand-written markdown notes, e.g. "data/community/**\/*.md". */
      glob: z.string().min(1),
    }),
  }),
  z.object({
    ...sourceBase,
    kind: z.literal("law-change-seed"),
    options: z.object({
      /** JSON file with the seeded change log (Step 10). */
      file: z.string().min(1),
    }),
  }),
]);

export type SourceDefinition = z.infer<typeof sourceDefinitionSchema>;
export type SourceDefinitionInput = z.input<typeof sourceDefinitionSchema>;

/** Community metadata attached to tier-4 chunks and live results. */
export const communityMetadataSchema = z.object({
  provider: z.enum(["notes", "reddit"]),
  permalink: z.url(),
  createdUtc: z.number().int().optional(),
  score: z.number().optional(),
  numComments: z.number().int().optional(),
  flair: z.string().optional(),
  isComment: z.boolean().optional(),
  /** For curated notes: when the author read the thread. */
  readAt: z.iso.date().optional(),
});

/**
 * Metadata stored next to every vector. Everything the UI needs for a citation
 * and everything retrieval needs for ranking, freshness and temporal validity.
 */
export const chunkMetadataSchema = z
  .object({
    sourceId: sourceBase.id,
    tier: tierSchema,
    kind: sourceKindSchema,
    title: z.string().min(1),
    /** Canonical deep link (section page, heading anchor, permalink). */
    url: z.url(),
    lang: langSchema,
    jurisdictionScope: jurisdictionScopeSchema,
    /** e.g. "§ 10 Abs. 3 StAG", "Art. 16 GG", "AH-StAG 2025 Nr. 10.1.1". */
    sectionRef: z.string().min(1).optional(),
    lawAbbrev: z.string().min(1).optional(),
    /** As-of text from the source, e.g. "Zuletzt geändert durch Art. 3 G v. 21.7.2026 I Nr. 221". */
    stand: z.string().min(1).optional(),
    /** ISO date parsed from `stand` when possible; drives the outdated-page rule. */
    standDate: z.iso.date().optional(),
    fetchedAt: z.iso.datetime(),
    /** Hash or builddate identifying the version of the source this chunk came from. */
    sourceVersion: z.string().min(1),
    contentHash: z.string().min(1),
    chunkIndex: z.number().int().min(0),
    /** Law version this chunk belongs to (gii-law only). */
    versionId: z.string().min(1).optional(),
    validFrom: z.iso.date().optional(),
    /** null/undefined = currently valid. */
    validTo: z.iso.date().nullable().optional(),
    /** True for archived law versions and the "old rule" part of change notes. */
    historical: z.boolean().default(false),
    community: communityMetadataSchema.optional(),
    /** The chunk text itself; pgvector rows have no text column, so retrieval reads it from here (Mastra convention). */
    text: z.string().optional(),
  })
  .superRefine((m, ctx) => {
    if (m.tier === 4 && !m.community) {
      ctx.addIssue({ code: "custom", path: ["community"], message: "tier-4 chunks need community metadata" });
    }
    if (m.kind === "gii-law" && (!m.sectionRef || !m.lawAbbrev)) {
      ctx.addIssue({ code: "custom", path: ["sectionRef"], message: "gii-law chunks need sectionRef and lawAbbrev" });
    }
    if (m.validFrom && m.validTo && m.validTo < m.validFrom) {
      ctx.addIssue({ code: "custom", path: ["validTo"], message: "validTo must not be before validFrom" });
    }
    if (m.historical && !m.validTo) {
      ctx.addIssue({ code: "custom", path: ["validTo"], message: "historical chunks must have a validTo date" });
    }
  });

export type ChunkMetadata = z.infer<typeof chunkMetadataSchema>;
export type ChunkMetadataInput = z.input<typeof chunkMetadataSchema>;

/** A chunk ready for embedding and upsert. */
export type Chunk = { id: string; text: string; metadata: ChunkMetadata };

const CHUNK_ID_SEPARATOR = "::";

/** Deterministic chunk ID: unchanged sources re-upsert the same IDs; new versions get new IDs. */
export function chunkId(sourceId: string, sourceVersion: string, chunkIndex: number): string {
  return [sourceId, sourceVersion, String(chunkIndex)].join(CHUNK_ID_SEPARATOR);
}

export function parseChunkId(id: string): { sourceId: string; sourceVersion: string; chunkIndex: number } | null {
  const parts = id.split(CHUNK_ID_SEPARATOR);
  if (parts.length !== 3) return null;
  const chunkIndex = Number(parts[2]);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) return null;
  return { sourceId: parts[0], sourceVersion: parts[1], chunkIndex };
}
