import { handleChatStream } from "@mastra/ai-sdk";
import { createUIMessageStreamResponse } from "ai";
import { NextResponse } from "next/server";
import { toChatErrorCode } from "@/chat/errors";
import { validateChatRequest } from "@/chat/validate-request";
import { mastra } from "@/mastra";

export const runtime = "nodejs";
// Streaming answers with tool calls can take a while; Vercel Hobby allows up to 300 s.
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const params = validateChatRequest(body);
  if (!params) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE });
  }

  try {
    const stream = await handleChatStream({
      mastra,
      agentId: "citizenshipAgent",
      version: "v7",
      params,
      // Only a short code reaches the client; details stay in the server log.
      onError: (error) => {
        console.error("[chat] upstream error", error);
        return toChatErrorCode(error);
      },
    });
    return createUIMessageStreamResponse({ stream, headers: NO_STORE });
  } catch (error) {
    console.error("[chat] failed", error);
    return NextResponse.json({ error: "chat_failed" }, { status: 500, headers: NO_STORE });
  }
}
