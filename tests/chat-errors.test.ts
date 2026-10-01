import { describe, expect, it } from "vitest";
import { toChatErrorCode } from "@/chat/errors";

describe("toChatErrorCode", () => {
  it("maps upstream conditions to short codes", () => {
    expect(toChatErrorCode(Object.assign(new Error("This model is currently experiencing high demand"), { statusCode: 503 }))).toBe("model_busy");
    expect(toChatErrorCode(Object.assign(new Error("Resource exhausted"), { statusCode: 429 }))).toBe("rate_limited");
    expect(toChatErrorCode(new Error("The operation timed out"))).toBe("timeout");
    expect(toChatErrorCode(new Error("boom at /Users/someone/project/file.ts:12"))).toBe("model_error");
    expect(toChatErrorCode(undefined)).toBe("model_error");
  });
});
