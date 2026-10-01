import { sourceDefinitionSchema, type SourceDefinition, type SourceDefinitionInput } from "./types";

/**
 * Curated list of sources. Adding a source = adding an entry here (see README
 * "Adding a source"). Tier 1 law comes from gesetze-im-internet.de XML.
 *
 * Reddit is NOT a registry source: it is a live CommunityProvider (Step 11).
 */
const definitions: SourceDefinitionInput[] = [
  {
    id: "stag",
    tier: 1,
    kind: "gii-law",
    title: "Staatsangehörigkeitsgesetz (StAG)",
    url: "https://www.gesetze-im-internet.de/stag/",
    lang: "de",
    jurisdictionScope: "federal",
    enabled: true,
    refreshCadenceDays: 7,
    options: { lawAbbrev: "StAG", slug: "stag" },
  },
  // TODO Step 7: GG (Art. 16, 116), AufenthG (residence-title sections), FreizügG/EU, EinbTestV,
  //              BGBl amending acts (pdf), BMI/BVA/BAMF/Integrationsbeauftragte pages and PDFs (tier 2),
  //              Berlin LEA pages (tier 3, jurisdictionScope "Berlin").
  // TODO Step 10: `stag-changes` (law-change-seed, data/law-changes/stag.json).
  // TODO Step 11: `community-notes` (data/community/**/*.md).
];

/** Validates every entry and rejects duplicate IDs. Throws with a readable message. */
export function validateRegistry(input: SourceDefinitionInput[]): SourceDefinition[] {
  const parsed = input.map((entry, index) => {
    const result = sourceDefinitionSchema.safeParse(entry);
    if (!result.success) {
      const details = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid source definition at index ${index} (${String(entry.id ?? "?")}): ${details}`);
    }
    return result.data;
  });
  const seen = new Set<string>();
  for (const source of parsed) {
    if (seen.has(source.id)) throw new Error(`Duplicate source id in registry: ${source.id}`);
    seen.add(source.id);
  }
  return parsed;
}

export const registry: SourceDefinition[] = validateRegistry(definitions);

export function getSource(id: string): SourceDefinition {
  const source = registry.find((s) => s.id === id);
  if (!source) throw new Error(`Unknown source id: ${id}`);
  return source;
}

export function enabledSources(ids?: string[]): SourceDefinition[] {
  const chosen = ids?.length ? ids.map(getSource) : registry;
  return chosen.filter((s) => s.enabled);
}
