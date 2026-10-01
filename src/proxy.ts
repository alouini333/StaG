import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./auth/constants";
import { verifySessionToken } from "./auth/session";

/** Paths reachable without a session. `/api/cron/*` is protected by CRON_SECRET instead (Step 12). */
const PUBLIC_PATHS = ["/login", "/api/login"];
const PUBLIC_PREFIXES = ["/api/cron/"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // Read directly from process.env: src/env.ts is a server-only module with
  // broader requirements than the gate needs.
  const secret = process.env.AUTH_SECRET;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const valid = secret ? await verifySessionToken(token, secret) : false;
  if (valid) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except Next.js internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
