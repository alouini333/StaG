import { NextResponse } from "next/server";
import { currentIndexStatus } from "@/mastra/agents/citizenship-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Behind the password gate: freshness information for the UI banner. */
export async function GET() {
  const status = await currentIndexStatus();
  return NextResponse.json(status ?? { lastIngestedAt: null, indexAgeDays: null, stale: true, laws: [], pendingSources: [] }, {
    headers: { "Cache-Control": "no-store" },
  });
}
