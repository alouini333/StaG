/** Routes reachable without a session. `/api/cron/*` will be protected by CRON_SECRET (Step 12). */
export const PUBLIC_PATHS = ["/login", "/api/login"] as const;
export const PUBLIC_PREFIXES = ["/api/cron/"] as const;

export function isPublicPath(pathname: string): boolean {
  return (PUBLIC_PATHS as readonly string[]).includes(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
