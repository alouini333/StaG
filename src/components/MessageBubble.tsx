"use client";

import type { UIMessage } from "ai";
import { Fragment } from "react";
import { CITATION_MARKER, sanitizeCitations } from "@/chat/citations";
import { collectSources } from "@/chat/sources";
import { SourceList } from "./SourceList";

/** Renders text with [S1]-style markers as links to the sources list. */
function CitedText({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(CITATION_MARKER)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(<Fragment key={`t${start}`}>{text.slice(last, start)}</Fragment>);
    nodes.push(
      <a key={`c${start}`} className="cite" href={`#cite-${match[1]}`} title={match[1]}>
        [{match[1]}]
      </a>,
    );
    last = start + match[0].length;
  }
  if (last < text.length) nodes.push(<Fragment key="tail">{text.slice(last)}</Fragment>);
  return <>{nodes}</>;
}

/**
 * Assistant/user message. Tool parts are turned into the sources list; the
 * streamed text is sanitised client-side with the same rules as the server
 * CitationGuard (unknown markers and non-retrieved URLs never show).
 */
export function MessageBubble({ message, streaming }: { message: UIMessage; streaming?: boolean }) {
  const rawText = message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");

  if (message.role === "user") {
    return (
      <div className="bubble user">
        <span className="bubble-role">Sie / You</span>
        <div className="bubble-text">{rawText}</div>
      </div>
    );
  }

  const sources = collectSources(message);
  const toolsRunning = message.parts.some((p) => p.type.startsWith("tool-") && (p as { state?: string }).state !== "output-available");
  // While streaming, only hide URLs; markers may still be incomplete. Full sanitisation once done.
  const text = streaming ? rawText : sanitizeCitations(rawText, sources.allow).text;

  return (
    <div className="bubble assistant">
      <span className="bubble-role">Assistent / Assistant</span>
      {toolsRunning && !rawText ? <div className="bubble-text muted">Suche in den Quellen… / Searching the sources…</div> : null}
      {text ? (
        <div className="bubble-text">
          <CitedText text={text} />
        </div>
      ) : !toolsRunning ? (
        <div className="bubble-text muted">…</div>
      ) : null}
      {!streaming ? <SourceList {...sources} /> : null}
    </div>
  );
}
