import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { searchSources } from "../../retrieval/search";

const citedResultSchema = z.object({
  citationId: z.string(),
  tier: z.number().int().min(1).max(4),
  tierLabel: z.string(),
  title: z.string(),
  sectionRef: z.string().optional(),
  url: z.string(),
  stand: z.string().optional(),
  standDate: z.string().optional(),
  possiblyOutdated: z.boolean(),
  historical: z.boolean(),
  validFrom: z.string().optional(),
  validTo: z.string().nullable().optional(),
  jurisdictionScope: z.string(),
  lang: z.enum(["de", "en"]),
  excerpt: z.string(),
  score: z.number(),
  community: z
    .object({
      provider: z.enum(["notes", "reddit"]),
      permalink: z.string(),
      createdUtc: z.number().optional(),
      score: z.number().optional(),
      numComments: z.number().optional(),
      flair: z.string().optional(),
      isComment: z.boolean().optional(),
      readAt: z.string().optional(),
    })
    .optional(),
});

export const searchCitizenshipSources = createTool({
  id: "searchCitizenshipSources",
  description: [
    "Retrieves the authoritative passages needed to answer a question about German citizenship or naturalisation.",
    "ALWAYS call this before giving any substantive answer. Results are grouped by authority: official (tier 1 law > tier 2 federal authority > tier 3 Land authority/institution) and, only when appropriate, community reports (tier 4, not authoritative).",
    "Cite results with their citationId in square brackets, e.g. [S1]; never write URLs yourself.",
    "Results flagged possiblyOutdated predate the current law and must be treated with caution; historical results are former law versions.",
  ].join(" "),
  inputSchema: z.object({
    queryDe: z
      .string()
      .min(3)
      .describe("German search query using legal terminology (e.g. 'Voraussetzungen Einbürgerung Aufenthaltsdauer § 10 StAG'). Translate English questions into German legal terms."),
    queryEn: z.string().min(3).describe("The same query in English (used for community sources)."),
    intent: z
      .enum(["legal", "procedural", "experience", "mixed"])
      .describe("legal = what the law/authority says; procedural = how to apply, documents, fees; experience = how it went for other people in practice; mixed = both."),
    asOfDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("ISO date when the question concerns a past event (birth, marriage, application date), so the law version valid then can be considered."),
    lang: z.enum(["de", "en"]).optional().describe("Language of the user's message, for labels."),
  }),
  outputSchema: z.object({
    official: z.array(citedResultSchema),
    community: z.array(citedResultSchema),
    communityIncluded: z.boolean(),
    communityReason: z.string(),
    communityProvider: z.enum(["none", "notes", "reddit"]),
    communityError: z.string().optional(),
    coverage: z.enum(["strong", "partial", "none"]),
    indexStatus: z.object({
      lastIngestedAt: z.string().nullable(),
      indexAgeDays: z.number().nullable(),
      stale: z.boolean(),
      laws: z.array(z.object({ lawAbbrev: z.string(), stand: z.string().nullable(), standDate: z.string().nullable() })),
      pendingSources: z.array(z.string()),
    }),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    try {
      return await searchSources(inputData);
    } catch (error) {
      console.error("[searchCitizenshipSources] retrieval failed", error);
      return {
        official: [],
        community: [],
        communityIncluded: false,
        communityReason: "retrieval unavailable",
        communityProvider: "none" as const,
        coverage: "none" as const,
        indexStatus: { lastIngestedAt: null, indexAgeDays: null, stale: true, laws: [], pendingSources: [] },
        error: "retrieval_unavailable",
      };
    }
  },
});
