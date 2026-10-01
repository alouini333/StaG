/**
 * Maps upstream failures to short, stable error codes that are safe to send
 * to the browser. Never forward raw error messages or stack traces.
 */
export type ChatErrorCode = "model_busy" | "rate_limited" | "timeout" | "model_error";

export function toChatErrorCode(error: unknown): ChatErrorCode {
  const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : undefined;
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (status === 503 || /high demand|overloaded|unavailable/i.test(message)) return "model_busy";
  if (status === 429 || /quota|rate limit|resource exhausted/i.test(message)) return "rate_limited";
  if (/timed? ?out|aborted/i.test(message)) return "timeout";
  return "model_error";
}

export const CHAT_ERROR_TEXT: Record<ChatErrorCode, string> = {
  model_busy: "Das Modell ist gerade überlastet. Bitte in ein paar Sekunden erneut versuchen. / The model is busy right now, please retry in a few seconds.",
  rate_limited: "Zu viele Anfragen. Bitte kurz warten. / Too many requests, please wait a moment.",
  timeout: "Zeitüberschreitung. Bitte erneut versuchen. / The request timed out, please retry.",
  model_error: "Etwas ist schiefgelaufen. / Something went wrong.",
};
