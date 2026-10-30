import type { Processor, ProcessOutputResultArgs } from "@mastra/core/processors";

type Message = ProcessOutputResultArgs["messages"][number];
import { allowlistFromToolOutputs, sanitizeCitations } from "../../chat/citations";

/**
 * Output processor that enforces citation discipline on the final result:
 * citation markers must come from this run's tool results and URLs must be
 * among the retrieved sources. Works on the resolved result (generate() and
 * the persisted message); streamed deltas are additionally sanitised in the
 * browser with the same pure function (src/chat/citations.ts).
 */
export class CitationGuard implements Processor {
  readonly id = "citation-guard";
  readonly name = "CitationGuard";

  async processOutputResult(args: ProcessOutputResultArgs): Promise<Message[]> {
    const outputs: unknown[] = [];
    for (const step of args.result?.steps ?? []) {
      for (const tr of (step as { toolResults?: unknown[] }).toolResults ?? []) {
        const r = tr as Record<string, unknown>;
        outputs.push(r.output ?? r.result ?? r.payload ?? r);
      }
    }
    const allow = allowlistFromToolOutputs(outputs);

    return args.messages.map((message) => {
      if (message.role !== "assistant") return message;
      const parts = (message.content as { parts?: Array<{ type: string; text?: string }> }).parts;
      if (!Array.isArray(parts)) return message;
      let changed = false;
      const nextParts = parts.map((part) => {
        if (part.type !== "text" || typeof part.text !== "string") return part;
        const { text, removedIds, removedUrls } = sanitizeCitations(part.text, allow);
        if (removedIds.length || removedUrls.length) {
          changed = true;
          console.warn(`[citation-guard] removed ids=${JSON.stringify(removedIds)} urls=${JSON.stringify(removedUrls)}`);
        }
        return text === part.text ? part : { ...part, text };
      });
      return changed ? ({ ...message, content: { ...(message.content as object), parts: nextParts } } as Message) : message;
    });
  }
}
