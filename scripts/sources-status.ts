/** Shows per-source ingestion state, law versions and chunk counts. Usage: pnpm sources:status */
import "dotenv/config";
import { closePools, getPool } from "../src/db/pool";
import { listLawVersions, listSourceVersions } from "../src/db/repositories";
import { vectorIndexName } from "../src/mastra/config/models";
import { registry } from "../src/sources/registry";
import { table } from "./_cli";

async function main() {
  const db = getPool("session");
  const indexName = vectorIndexName();
  const versions = new Map((await listSourceVersions(db)).map((v) => [v.sourceId, v]));

  const counts = new Map<string, { current: number; historical: number }>();
  const { rows } = await db.query<{ source_id: string; historical: boolean; n: string }>(
    `select metadata->>'sourceId' as source_id, coalesce((metadata->>'historical')::boolean, false) as historical, count(*)::text as n
     from "${indexName}" group by 1, 2`,
  );
  for (const r of rows) {
    const entry = counts.get(r.source_id) ?? { current: 0, historical: 0 };
    if (r.historical) entry.historical += Number(r.n);
    else entry.current += Number(r.n);
    counts.set(r.source_id, entry);
  }

  console.log(`Vector index: ${indexName}\n`);
  console.log(
    table(
      registry.map((s) => {
        const v = versions.get(s.id);
        const c = counts.get(s.id);
        return {
          source: s.id,
          tier: s.tier,
          kind: s.kind,
          enabled: s.enabled ? "yes" : "no",
          status: v?.status ?? "never",
          version: v?.sourceVersion ?? "",
          stand: v?.stand ?? "",
          fetchedAt: v?.fetchedAt?.slice(0, 19) ?? "",
          chunks: c ? `${c.current}${c.historical ? ` (+${c.historical} hist.)` : ""}` : "0",
          pending: v?.pendingUpdate ? `yes: ${v.pendingReason ?? ""}` : "",
        };
      }),
    ),
  );

  const laws = await listLawVersions(db);
  if (laws.length > 0) {
    console.log("\nLaw versions:\n");
    console.log(
      table(
        laws.map((l) => ({
          law: l.lawAbbrev,
          version: l.versionId,
          current: l.isCurrent ? "yes" : "",
          standDate: l.standDate ?? "",
          validFrom: l.validFrom ?? "",
          validTo: l.validTo ?? "",
          stand: l.stand ?? "",
        })),
      ),
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closePools());
