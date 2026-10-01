/**
 * Minimal in-memory rate limiter (fixed window). Best effort only: on
 * serverless hosts every instance keeps its own counters, so this slows
 * attackers down but is not a hard guarantee.
 */
type Window = { count: number; resetAt: number };

export function createRateLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const windows = new Map<string, Window>();

  return {
    /** Returns true when the request is allowed. */
    allow(key: string, now = Date.now()): boolean {
      const current = windows.get(key);
      if (!current || current.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      current.count += 1;
      return current.count <= max;
    },
    reset() {
      windows.clear();
    },
  };
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
