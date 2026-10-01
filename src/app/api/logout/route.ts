import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/auth/constants";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return response;
}
