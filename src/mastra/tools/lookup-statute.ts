import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getPool } from "../../db/pool";
import { lookupStatute as lookup } from "../../retrieval/statute";

export const lookupStatute = createTool({
  id: "lookupStatute",
  description: [
    "Returns the exact current text of a section (§) or article of an ingested German law (StAG, GG, AufenthG, FreizügG/EU, EinbTestV).",
    "Use it when the user names a specific provision or when you need to quote the precise wording. Cite the returned citationId, e.g. [L-StAG-10].",
    "A repealed provision is returned with repealed=true and the text '(weggefallen)'.",
  ].join(" "),
  inputSchema: z.object({
    lawAbbrev: z.string().optional().describe("Law abbreviation, e.g. 'StAG', 'GG', 'AufenthG'. Defaults to StAG."),
    section: z.string().describe("Section or article, e.g. '10', '§ 10', '§ 10 Abs. 3', 'Art. 16'."),
    paragraph: z.number().int().positive().optional().describe("Absatz number, if only one paragraph is needed."),
  }),
  outputSchema: z.union([
    z.object({ found: z.literal(false), lawAbbrev: z.string(), sectionKey: z.string(), message: z.string() }),
    z.object({
      found: z.literal(true),
      citationId: z.string(),
      lawAbbrev: z.string(),
      sectionRef: z.string(),
      title: z.string().nullable(),
      text: z.string(),
      url: z.string().nullable(),
      stand: z.string().nullable(),
      standDate: z.string().nullable(),
      repealed: z.boolean(),
      versionId: z.string(),
      paragraph: z.number().nullable(),
    }),
  ]),
  execute: async (inputData) => lookup(getPool("runtime"), inputData),
});
