import { describe, expect, it } from "vitest";
import { vectorIndexName } from "@/mastra/config/vector-index-name";

describe("vectorIndexName", () => {
  it("encodes model and dimensions in a Postgres-safe identifier", () => {
    expect(vectorIndexName("gemini-embedding-001", 768)).toBe("citizenship_gemini_embedding_001_768");
  });

  it("changes when the model or the dimensions change", () => {
    const base = vectorIndexName("gemini-embedding-001", 768);
    expect(vectorIndexName("gemini-embedding-2", 768)).not.toBe(base);
    expect(vectorIndexName("gemini-embedding-001", 1536)).not.toBe(base);
  });
});
