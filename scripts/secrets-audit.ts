/** Checks that no secret name or server-only module leaks into client bundles or git history. Usage: pnpm audit:secrets (after pnpm build) */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const NEEDLES = ["GOOGLE_GENERATIVE_AI_API_KEY", "DATABASE_URL", "APP_PASSWORD", "AUTH_SECRET", "CRON_SECRET", "env.schema", "pooler.supabase.com"];

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? files(f) : [f];
  });
}

let failed = false;
const staticDir = path.join(process.cwd(), ".next", "static");
if (!existsSync(staticDir)) {
  console.error("[audit] .next/static missing – run `pnpm build` first");
  process.exit(1);
}
for (const file of files(staticDir)) {
  const content = readFileSync(file, "utf8");
  for (const needle of NEEDLES) {
    if (content.includes(needle)) {
      console.error(`[audit] client bundle ${path.relative(process.cwd(), file)} contains "${needle}"`);
      failed = true;
    }
  }
}
const envHistory = execSync("git log --all --diff-filter=A --name-only --pretty=format: -- .env .env.local .env.production 2>/dev/null || true", { encoding: "utf8" }).trim();
if (envHistory) {
  console.error(`[audit] an env file was committed at some point:\n${envHistory}`);
  failed = true;
}
console.log(failed ? "[audit] FAILED" : "[audit] clean: no secret names in client bundles, no env files in git history");
process.exit(failed ? 1 : 0);
