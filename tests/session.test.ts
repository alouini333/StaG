import { describe, expect, it } from "vitest";
import { constantTimeEqual, createSessionToken, verifySessionToken } from "@/auth/session";
import { SESSION_TTL_SECONDS } from "@/auth/constants";

const secret = "0123456789abcdef0123456789abcdef";

describe("session tokens", () => {
  it("round-trips a freshly created token", async () => {
    const token = await createSessionToken(secret);
    expect(await verifySessionToken(token, secret)).toBe(true);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await createSessionToken(secret);
    expect(await verifySessionToken(token, "another-secret-another-secret-123")).toBe(false);
  });

  it("rejects tampered payloads and malformed tokens", async () => {
    const token = await createSessionToken(secret);
    const [payload, signature] = token.split(".");
    expect(await verifySessionToken(`${payload}x.${signature}`, secret)).toBe(false);
    expect(await verifySessionToken("garbage", secret)).toBe(false);
    expect(await verifySessionToken(undefined, secret)).toBe(false);
    expect(await verifySessionToken("", secret)).toBe(false);
  });

  it("expires after the TTL", async () => {
    const issuedAt = 1_700_000_000;
    const token = await createSessionToken(secret, issuedAt);
    expect(await verifySessionToken(token, secret, issuedAt + SESSION_TTL_SECONDS - 1)).toBe(true);
    expect(await verifySessionToken(token, secret, issuedAt + SESSION_TTL_SECONDS + 1)).toBe(false);
  });
});

describe("constantTimeEqual", () => {
  it("compares strings of equal and different lengths", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});
