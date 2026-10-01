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
    const vectors = await embedDocuments(texts, { model, modelId: "gemini-embedding-001", batchDelayMs: 0 });
    expect(vectors.length).toBe(texts.length);
    expect(calls).toEqual([EMBED_BATCH_SIZE, 5]);
    expect(EMBED_BATCH_SIZE).toBeLessThanOrEqual(100);
  });

  it("rejects vectors with the wrong dimensionality", async () => {
    const { model } = mockModel(EMBEDDING_DIMENSIONS + 1);
    await expect(embedDocuments(["x"], { model, modelId: "gemini-embedding-001", maxAttempts: 1, batchDelayMs: 0 })).rejects.toThrow(/dimensions/);
  });

  it("knows which models support task types", () => {
    expect(supportsTaskType("gemini-embedding-001")).toBe(true);
    expect(supportsTaskType("gemini-embedding-2")).toBe(false);
  });
});

describe("suggestedRetryMs", () => {
  it("parses Gemini's retry hint", async () => {
    const { suggestedRetryMs } = await import("@/retrieval/embed");
    expect(suggestedRetryMs(new Error("Quota exceeded … Please retry in 41.51952892s."))).toBe(42520);
    expect(suggestedRetryMs(new Error("boom"))).toBeNull();
  });
});
