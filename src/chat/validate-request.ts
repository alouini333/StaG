import type { UIMessage } from "ai";
import { z } from "zod";

export const MAX_MESSAGES = 40;
export const MAX_TEXT_CHARS = 8000;

const partSchema = z
  .object({ type: z.string(), text: z.string().max(MAX_TEXT_CHARS).optional() })
  .passthrough();

const messageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["user", "assistant", "system"]),
    parts: z.array(partSchema).min(1),
  })
  .passthrough();

export const chatRequestSchema = z
  .object({
    messages: z.array(messageSchema).min(1).max(MAX_MESSAGES),
    trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
  })
  .passthrough();

/** The shape `handleChatStream` expects (what `useChat` sends). */
export type ChatRequest = {
  messages: UIMessage[];
  trigger?: "submit-message" | "regenerate-message";
  resumeData?: Record<string, unknown>;
};

/**
 * Validates shape and size limits of a chat request. Returns the body typed as
 * AI SDK UI messages, or null when malformed. Zod checks the parts we care
 * about (role, ids, text length); the full `UIMessagePart` union is left to the
 * AI SDK, which built the messages in the first place.
 */
export function validateChatRequest(body: unknown): ChatRequest | null {
  const result = chatRequestSchema.safeParse(body);
  return result.success ? (result.data as unknown as ChatRequest) : null;
}
