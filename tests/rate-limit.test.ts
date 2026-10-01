import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/auth/rate-limit";

describe("createRateLimiter", () => {
  it("allows up to max requests per window and resets afterwards", () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 1000 });
    const t0 = 10_000;
    expect(limiter.allow("ip", t0)).toBe(true);
    expect(limiter.allow("ip", t0 + 1)).toBe(true);
    expect(limiter.allow("ip", t0 + 2)).toBe(true);
    expect(limiter.allow("ip", t0 + 3)).toBe(false);
    expect(limiter.allow("other", t0 + 3)).toBe(true);
    expect(limiter.allow("ip", t0 + 1001)).toBe(true);
  });
});
