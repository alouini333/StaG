/**
 * The vector index name encodes the embedding model and dimensionality, so that
 * changing either can never silently mix incompatible vectors: a new name means
 * a new, empty index that must be filled with `pnpm ingest --force`.
 */
export function vectorIndexName(embeddingModelId: string, dimensions: number): string {
  const slug = embeddingModelId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `citizenship_${slug}_${dimensions}`;
}
