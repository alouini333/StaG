import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPublicPath, PUBLIC_PATHS } from "@/auth/public-paths";

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

/** Every API route must be behind the password gate unless it is explicitly public. */
describe("password gate coverage", () => {
  const appDir = path.join(process.cwd(), "src/app");
  const routes = routeFiles(appDir).map((f) => "/" + path.relative(appDir, path.dirname(f)).split(path.sep).join("/"));

  it("finds the API routes", () => {
    expect(routes).toEqual(expect.arrayContaining(["/api/chat", "/api/login", "/api/logout", "/api/health", "/api/index-status"]));
  });

  it("only login and cron routes are public", () => {
    const publicRoutes = routes.filter((r) => isPublicPath(r));
    const allowed = routes.filter((r) => (PUBLIC_PATHS as readonly string[]).includes(r) || r.startsWith("/api/cron/"));
    expect(publicRoutes.sort()).toEqual(allowed.sort());
    expect(publicRoutes).toEqual(["/api/login"]);
    for (const r of ["/api/chat", "/api/logout", "/api/health", "/api/index-status"]) expect(isPublicPath(r)).toBe(false);
  });
});
