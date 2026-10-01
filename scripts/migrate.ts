/** Applies pending SQL migrations via the session pooler. Usage: pnpm db:migrate */
import "dotenv/config";
import { closePools, getPool } from "../src/db/pool";
import { describeConnection } from "../src/db/pool-config";
import { runMigrations } from "../src/db/migrate";
import { connectionStringFor } from "../src/db/pool";

async function main() {
  console.log(`[migrate] database: ${describeConnection(connectionStringFor("session"))}`);
  const result = await runMigrations(getPool("session"));
  console.log(`[migrate] applied: ${result.applied.length ? result.applied.join(", ") : "none"}`);
  console.log(`[migrate] already applied: ${result.skipped.length}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closePools());
