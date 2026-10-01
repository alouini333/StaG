import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthConfig } from "@/auth/config";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/auth/constants";
import { clientKey, createRateLimiter } from "@/auth/rate-limit";
import { constantTimeEqual, createSessionToken } from "@/auth/session";

export const runtime = "nodejs";

const bodySchema = z.object({ password: z.string().min(1).max(256) });
const limiter = createRateLimiter({ max: 10, windowMs: 10 * 60 * 1000 });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  if (!limiter.allow(clientKey(request))) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { password, secret } = getAuthConfig();
  if (!constantTimeEqual(parsed.data.password, password)) {
    await sleep(500);
    return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: await createSessionToken(secret),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
