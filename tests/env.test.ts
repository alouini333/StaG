import { describe, expect, it } from "vitest";
import { parseEnv } from "@/env.schema";

const minimal = {
  GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
  DATABASE_URL: "postgresql://postgres.ref:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres",
  DATABASE_URL_SESSION: "postgresql://postgres.ref:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
};

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

  it("fails with a readable message when required variables are missing", () => {
    expect(() => parseEnv({})).toThrowError(/GOOGLE_GENERATIVE_AI_API_KEY/);
    expect(() => parseEnv({ GOOGLE_GENERATIVE_AI_API_KEY: "k" })).toThrowError(/DATABASE_URL/);
  });

  it("does not require the session URL (scripts check it themselves; Vercel never has it)", () => {
    const { DATABASE_URL_SESSION: _omit, ...withoutSession } = minimal;
    void _omit;
    expect(parseEnv(withoutSession).DATABASE_URL_SESSION).toBeUndefined();
  });

  it("treats empty strings from .env files as unset", () => {
    const env = parseEnv({ ...minimal, CRON_SECRET: "", APP_PASSWORD: "   " });
    expect(env.CRON_SECRET).toBeUndefined();
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
