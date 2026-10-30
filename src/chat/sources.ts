import type { UIMessage } from "ai";
import { allowlistFromToolOutputs, type CitationAllowlist } from "./citations";

export type SourceItem = {
  citationId: string;
  tier: number;
  tierLabel: string;
  title: string;
  sectionRef?: string;
  url: string;
  stand?: string;
  possiblyOutdated?: boolean;
  historical?: boolean;
  validFrom?: string;
  validTo?: string | null;
  jurisdictionScope?: string;
  community?: { provider: string; permalink: string; createdUtc?: number; score?: number; flair?: string };
};

export type CollectedSources = {
  official: SourceItem[];
  community: SourceItem[];
  communityIncluded: boolean;
  communityReason: string | null;
  communityError: string | null;
  retrievalError: string | null;
  allow: CitationAllowlist;
};

type ToolPart = { type: string; state?: string; output?: unknown };

/** Reads the outputs of this message's tool calls (AI SDK v7 `tool-<name>` parts). */
export function collectSources(message: Pick<UIMessage, "parts">): CollectedSources {
  const outputs: unknown[] = [];
  const result: CollectedSources = {
    official: [],
    community: [],
    communityIncluded: false,
    communityReason: null,
    communityError: null,
    retrievalError: null,
    allow: { validIds: new Set(), validUrls: new Set() },
  };
  for (const part of message.parts as ToolPart[]) {
    if (!part.type.startsWith("tool-") || part.state !== "output-available" || !part.output) continue;
    outputs.push(part.output);
    const out = part.output as Record<string, unknown>;
    if (part.type === "tool-searchCitizenshipSources") {
      result.official.push(...((out.official as SourceItem[]) ?? []));
      result.community.push(...((out.community as SourceItem[]) ?? []));
      result.communityIncluded ||= Boolean(out.communityIncluded);
      result.communityReason = (out.communityReason as string) ?? result.communityReason;
      result.communityError = (out.communityError as string) ?? result.communityError;
      result.retrievalError = (out.error as string) ?? result.retrievalError;
    } else if (part.type === "tool-lookupStatute" && out.found === true) {
      result.official.push({
        citationId: out.citationId as string,
        tier: 1,
        tierLabel: "Gesetz / Law",
        title: `${out.sectionRef as string}${out.title ? ` – ${out.title as string}` : ""}`,
        sectionRef: out.sectionRef as string,
        url: (out.url as string) ?? "",
        stand: (out.stand as string) ?? undefined,
        historical: false,
        possiblyOutdated: false,
        jurisdictionScope: "federal",
      });
    }
  }
  // de-duplicate by citation id (a message may call tools several times)
  const seen = new Set<string>();
  result.official = result.official.filter((s) => (seen.has(s.citationId) ? false : (seen.add(s.citationId), true)));
  result.community = result.community.filter((s) => (seen.has(s.citationId) ? false : (seen.add(s.citationId), true)));
  result.allow = allowlistFromToolOutputs(outputs);
  return result;
}
