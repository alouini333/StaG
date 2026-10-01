"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        const next = params.get("next");
        router.replace(next && next.startsWith("/") ? next : "/");
        router.refresh();
        return;
      }
      setError(
        response.status === 429
          ? "Zu viele Versuche. Bitte später erneut versuchen. / Too many attempts, try again later."
          : "Falsches Passwort. / Wrong password.",
      );
    } catch {
      setError("Verbindungsfehler. / Connection error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login" onSubmit={onSubmit}>
      <h1>Einbürgerung / German citizenship assistant</h1>
      <p>Diese Anwendung ist passwortgeschützt. / This application is password protected.</p>
      <label htmlFor="password">Passwort / Password</label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        autoFocus
      />
      <button type="submit" disabled={busy || password.length === 0}>
        {busy ? "…" : "Anmelden / Sign in"}
      </button>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
