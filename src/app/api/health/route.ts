import { NextResponse } from "next/server";
import { getPool } from "@/db/pool";
import { vectorIndexName, EMBEDDING_DIMENSIONS, modelIds } from "@/mastra/config/models";
import { createVectorStore } from "@/retrieval/vector-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Behind the password gate. Reports database and vector-index readiness without leaking configuration. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const started = Date.now();
    await getPool("runtime").query("select 1");
    const dbMs = Date.now() - started;

    const indexName = vectorIndexName();
    let index: { exists: boolean; count?: number; dimension?: number } = { exists: false };
    try {
      const stats = await createVectorStore("runtime").describeIndex({ indexName });
      index = { exists: true, count: stats.count, dimension: stats.dimension };
    } catch {
      index = { exists: false };
    }

    return NextResponse.json(
      {
        db: "ok",
        dbMs,
        index: { name: indexName, ...index },
        embedding: { model: modelIds.embedding, dimensions: EMBEDDING_DIMENSIONS },
        chatModel: modelIds.chat,
      },
      { headers },
    );
  } catch (error) {
    console.error("[health] database check failed", error);
    return NextResponse.json({ db: "error" }, { status: 503, headers });
  }
}
