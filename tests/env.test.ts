import { describe, expect, it } from "vitest";
import { parseEnv } from "@/env.schema";

const minimal = { GOOGLE_GENERATIVE_AI_API_KEY: "test-key" };

describe("parseEnv", () => {
  it("applies defaults when only the API key is set", () => {
    const env = parseEnv(minimal);
    expect(env.GEMINI_CHAT_MODEL).toBe("gemini-3.8-flash");
    expect(env.GEMINI_UTILITY_MODEL).toBe("gemini-3.5-flash-lite");
    expect(env.GEMINI_EMBEDDING_MODEL).toBe("gemini-embedding-001");
    expect(env.EMBEDDING_DIMENSIONS).toBe(768);
    expect(env.COMMUNITY_PROVIDER).toBe("none");
    expect(env.RETRIEVAL_RERANK).toBe(false);
    expect(env.STALE_AFTER_DAYS).toBe(30);
  });

  it("fails with a readable message when the API key is missing", () => {
    expect(() => parseEnv({})).toThrowError(/GOOGLE_GENERATIVE_AI_API_KEY/);
  });

  it("treats empty strings from .env files as unset", () => {
    const env = parseEnv({ ...minimal, DATABASE_URL: "", APP_PASSWORD: "   " });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.APP_PASSWORD).toBeUndefined();
  });

  it("parses booleans and numbers from strings", () => {
    const env = parseEnv({ ...minimal, RETRIEVAL_RERANK: "true", EMBEDDING_DIMENSIONS: "1536" });
    expect(env.RETRIEVAL_RERANK).toBe(true);
    expect(env.EMBEDDING_DIMENSIONS).toBe(1536);
  });

  it("rejects embedding dimensions above the pgvector index limit", () => {
    expect(() => parseEnv({ ...minimal, EMBEDDING_DIMENSIONS: "3072" })).toThrowError(
      /EMBEDDING_DIMENSIONS/,
    );
  });

  it("requires Reddit credentials only when the reddit provider is selected", () => {
    expect(() => parseEnv({ ...minimal, COMMUNITY_PROVIDER: "reddit" })).toThrowError(
      /REDDIT_CLIENT_ID/,
    );
    expect(() =>
      parseEnv({
        ...minimal,
        COMMUNITY_PROVIDER: "reddit",
        REDDIT_CLIENT_ID: "id",
        REDDIT_CLIENT_SECRET: "secret",
        REDDIT_USER_AGENT: "web:stag:0.1 (by /u/someone)",
      }),
    ).not.toThrow();
    expect(() => parseEnv({ ...minimal, COMMUNITY_PROVIDER: "notes" })).not.toThrow();
  });
});

describe("parseEnv with a .env copied from .env.example", () => {
  it("applies defaults for defaulted variables left empty", () => {
    const env = parseEnv({
      ...minimal,
      SOURCE_FETCH_USER_AGENT: "",
      EMBEDDING_DIMENSIONS: "",
      MASTRA_DISABLE_STORAGE_INIT: "",
      COMMUNITY_PROVIDER: "",
    });
    expect(env.SOURCE_FETCH_USER_AGENT).toMatch(/StaG/);
    expect(env.EMBEDDING_DIMENSIONS).toBe(768);
    expect(env.MASTRA_DISABLE_STORAGE_INIT).toBe(false);
    expect(env.COMMUNITY_PROVIDER).toBe("none");
  });
});
