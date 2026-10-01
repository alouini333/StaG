import { describe, expect, it } from "vitest";
import { MAX_MESSAGES, MAX_TEXT_CHARS, validateChatRequest } from "@/chat/validate-request";

const userMessage = (text: string) => ({ id: `m-${text.length}-${Math.random()}`, role: "user", parts: [{ type: "text", text }] });

describe("validateChatRequest", () => {
  it("accepts a minimal useChat body", () => {
    expect(validateChatRequest({ messages: [userMessage("Hallo")], trigger: "submit-message" })).not.toBeNull();
  });

  it("rejects malformed bodies", () => {
    expect(validateChatRequest(null)).toBeNull();
    expect(validateChatRequest({})).toBeNull();
    expect(validateChatRequest({ messages: [] })).toBeNull();
    expect(validateChatRequest({ messages: [{ role: "user", parts: [] }] })).toBeNull();
    expect(validateChatRequest({ messages: [{ role: "robot", parts: [{ type: "text", text: "x" }] }] })).toBeNull();
  });

  it("enforces size limits", () => {
    const tooMany = Array.from({ length: MAX_MESSAGES + 1 }, (_, i) => userMessage(`m${i}`));
    expect(validateChatRequest({ messages: tooMany })).toBeNull();
    expect(validateChatRequest({ messages: [userMessage("x".repeat(MAX_TEXT_CHARS + 1))] })).toBeNull();
    expect(validateChatRequest({ messages: [userMessage("x".repeat(MAX_TEXT_CHARS))] })).not.toBeNull();
  });
});

describe("validateChatRequest ids", () => {
  it("requires message ids (useChat always sends them)", () => {
    expect(validateChatRequest({ messages: [{ role: "user", parts: [{ type: "text", text: "x" }] }] })).toBeNull();
  });
});
