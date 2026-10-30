import type { ChunkMetadata } from "../sources/types";

export type CommunityProviderId = "none" | "notes" | "reddit";

/** A community hit, shaped like a retrieved chunk (tier 4) so ranking/citations treat it uniformly. */
export type CommunityResult = {
  id: string;
  score: number;
  text: string;
  metadata: ChunkMetadata & { tier: 4; community: NonNullable<ChunkMetadata["community"]> };
};

export type CommunitySearchInput = { queryEn: string; queryDe: string; k: number };

export interface CommunityProvider {
  readonly id: CommunityProviderId;
  search(input: CommunitySearchInput): Promise<CommunityResult[]>;
}

/** Tier 4 disabled: never returns anything. */
export class NoopCommunityProvider implements CommunityProvider {
  readonly id = "none" as const;
  async search(): Promise<CommunityResult[]> {
    return [];
  }
}

/** Step 11 adds the `notes` and `reddit` providers; until then every setting maps to Noop. */
export function createCommunityProvider(providerId: CommunityProviderId): CommunityProvider {
  void providerId;
  return new NoopCommunityProvider();
}
