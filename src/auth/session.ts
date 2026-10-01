/**
 * Signed session tokens for the shared-password gate.
 *
 * Uses only Web Crypto so the same code runs in Next.js route handlers and in
 * `proxy.ts`. Token format: `<base64url(payload)>.<base64url(hmac-sha256)>`.
 */
import { SESSION_TTL_SECONDS } from "./constants";

type SessionPayload = { iat: number; exp: number };

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
}

async function sign(secret: string, data: string): Promise<Uint8Array> {
  const key = await hmacKey(secret);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

/** Compare two strings without leaking their length-prefix difference through timing. */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

export async function createSessionToken(secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const payload: SessionPayload = { iat: nowSeconds, exp: nowSeconds + SESSION_TTL_SECONDS };
  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = toBase64Url(await sign(secret, encodedPayload));
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!token) return false;
  const [encodedPayload, signature, ...rest] = token.split(".");
  if (!encodedPayload || !signature || rest.length > 0) return false;

  const expected = toBase64Url(await sign(secret, encodedPayload));
  if (!constantTimeEqual(expected, signature)) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload))) as Partial<SessionPayload>;
    return typeof payload.exp === "number" && payload.exp > nowSeconds;
  } catch {
    return false;
  }
}
