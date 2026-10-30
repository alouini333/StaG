"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useState } from "react";
import { CHAT_ERROR_TEXT, type ChatErrorCode } from "@/chat/errors";
import { IndexStatusBanner } from "./IndexStatusBanner";
import { MessageBubble } from "./MessageBubble";

export function Chat() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error, regenerate, setMessages, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    onError: (err) => {
      // Session expired: the proxy answers 401 for API routes.
      if (/\b401\b|unauthorized/i.test(err.message)) {
        router.push("/login");
        router.refresh();
      }
    },
  });

  const busy = status === "submitted" || status === "streaming";

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    void sendMessage({ text });
    setInput("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <section className="chat">
      <header className="chat-header">
        <h1>Einbürgerung / German citizenship assistant</h1>
        <div className="chat-actions">
          <button type="button" onClick={() => setMessages([])} disabled={busy || messages.length === 0}>
            Neuer Chat / New chat
          </button>
          <button type="button" onClick={logout}>
            Abmelden / Logout
          </button>
        </div>
      </header>

      <IndexStatusBanner />

      <div className="chat-messages" aria-live="polite">
        {messages.length === 0 ? (
          <p className="chat-empty">
            Stellen Sie eine Frage zur deutschen Staatsangehörigkeit oder Einbürgerung – auf Deutsch oder Englisch. /
            Ask a question about German citizenship or naturalisation, in German or English.
          </p>
        ) : null}
        {messages.map((message, i) => (
          <MessageBubble key={message.id} message={message} streaming={busy && i === messages.length - 1} />
        ))}
        {status === "submitted" ? <p className="chat-status">Denkt nach… / Thinking…</p> : null}
      </div>

      {error ? (
        <div className="chat-error" role="alert">
          <span>{CHAT_ERROR_TEXT[(error.message as ChatErrorCode) in CHAT_ERROR_TEXT ? (error.message as ChatErrorCode) : "model_error"]}</span>
          <button type="button" onClick={() => regenerate()}>
            Erneut versuchen / Retry
          </button>
        </div>
      ) : null}

      <form className="chat-input" onSubmit={submit}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ihre Frage… / Your question… (Enter = senden, Shift+Enter = neue Zeile)"
          rows={3}
          disabled={busy}
        />
        {busy ? (
          <button type="button" onClick={() => stop()}>
            Stopp / Stop
          </button>
        ) : (
          <button type="submit" disabled={input.trim().length === 0}>
            Senden / Send
          </button>
        )}
      </form>
    </section>
  );
}
