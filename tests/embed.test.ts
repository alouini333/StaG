import { MockEmbeddingModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { EMBED_BATCH_SIZE, embedDocuments, supportsTaskType } from "@/retrieval/embed";
import { EMBEDDING_DIMENSIONS } from "@/mastra/config/models";

function mockModel(dimensions = EMBEDDING_DIMENSIONS) {
  const calls: number[] = [];
  const model = new MockEmbeddingModelV4({
    maxEmbeddingsPerCall: EMBED_BATCH_SIZE,
    doEmbed: async ({ values }) => {
      calls.push(values.length);
      return { embeddings: values.map(() => new Array(dimensions).fill(0.1)), warnings: [] };
    },
  });
  return { model, calls };
}

describe("embedDocuments", () => {
  it("batches by the provider limit and returns one vector per text", async () => {
    const { model, calls } = mockModel();
    const texts = Array.from({ length: EMBED_BATCH_SIZE + 5 }, (_, i) => `text ${i}`);
    const vectors = await embedDocuments(texts, { model, modelId: "gemini-embedding-001" });
    expect(vectors.length).toBe(texts.length);
    expect(calls).toEqual([EMBED_BATCH_SIZE, 5]);
  });

  it("rejects vectors with the wrong dimensionality", async () => {
    const { model } = mockModel(EMBEDDING_DIMENSIONS + 1);
    await expect(embedDocuments(["x"], { model, modelId: "gemini-embedding-001", maxAttempts: 1 })).rejects.toThrow(/dimensions/);
  });

  it("knows which models support task types", () => {
    expect(supportsTaskType("gemini-embedding-001")).toBe(true);
    expect(supportsTaskType("gemini-embedding-2")).toBe(false);
  });
});
