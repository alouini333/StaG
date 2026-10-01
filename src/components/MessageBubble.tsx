import type { UIMessage } from "ai";

/**
 * Renders the text parts of a message. Tool parts (`tool-<name>`) are ignored
 * for now; Step 9 adds the sources list built from them.
 */
export function MessageBubble({ message }: { message: UIMessage }) {
  const text = message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");

  if (!text && message.role === "assistant") {
    return <div className="bubble assistant streaming">…</div>;
  }

  return (
    <div className={`bubble ${message.role}`}>
      <span className="bubble-role">{message.role === "user" ? "Sie / You" : "Assistent / Assistant"}</span>
      <div className="bubble-text">{text}</div>
      {/* Step 9: <SourceList message={message} /> */}
    </div>
  );
}
