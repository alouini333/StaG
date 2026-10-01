import { embedMany, type EmbeddingModel } from "ai";
import { EMBEDDING_DIMENSIONS, embeddingModel, modelIds } from "../mastra/config/models";

export const EMBED_BATCH_SIZE = 100; // Gemini maxEmbeddingsPerCall

type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/** gemini-embedding-001 supports task types; gemini-embedding-2 does not (the task goes into the prompt instead). */
export function supportsTaskType(modelId: string = modelIds.embedding): boolean {
  return !/embedding-2/.test(modelId);
}

function providerOptions(taskType: TaskType, modelId: string) {
  return {
    google: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      ...(supportsTaskType(modelId) ? { taskType } : {}),
    },
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(error: unknown): boolean {
  const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return status === 429 || status === 503 || /high demand|overloaded|rate limit|resource exhausted|ECONNRESET|ETIMEDOUT/i.test(message);
}

export type EmbedOptions = {
  model?: EmbeddingModel;
  modelId?: string;
  taskType?: TaskType;
  onProgress?: (done: number, total: number) => void;
  /** Pause between batches to stay inside free-tier rate limits. */
  batchDelayMs?: number;
  maxAttempts?: number;
};

/**
 * Embeds many texts in batches with retry/backoff. Validates that the provider
 * returned the configured dimensionality so the index can never receive
 * mismatched vectors.
 */
export async function embedDocuments(texts: string[], options: EmbedOptions = {}): Promise<number[][]> {
  const model = options.model ?? embeddingModel;
  const modelId = options.modelId ?? modelIds.embedding;
  const taskType = options.taskType ?? "RETRIEVAL_DOCUMENT";
  const maxAttempts = options.maxAttempts ?? 5;
  const vectors: number[][] = [];

  for (let offset = 0; offset < texts.length; offset += EMBED_BATCH_SIZE) {
    const batch = texts.slice(offset, offset + EMBED_BATCH_SIZE);
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        const { embeddings } = await embedMany({
          model,
          values: batch,
          maxRetries: 0,
          providerOptions: providerOptions(taskType, modelId),
        });
        for (const vector of embeddings) {
          if (vector.length !== EMBEDDING_DIMENSIONS) {
            throw new Error(`Embedding has ${vector.length} dimensions, expected ${EMBEDDING_DIMENSIONS} (model ${modelId})`);
          }
        }
        vectors.push(...embeddings);
        break;
      } catch (error) {
        if (attempt >= maxAttempts || !isRetryable(error)) throw error;
        await sleep(Math.min(30_000, 1000 * 2 ** attempt));
      }
    }
    options.onProgress?.(Math.min(offset + batch.length, texts.length), texts.length);
    if (options.batchDelayMs && offset + EMBED_BATCH_SIZE < texts.length) await sleep(options.batchDelayMs);
  }
  return vectors;
}

export async function embedQuery(text: string, options: Omit<EmbedOptions, "taskType" | "onProgress"> = {}): Promise<number[]> {
  const [vector] = await embedDocuments([text], { ...options, taskType: "RETRIEVAL_QUERY" });
  return vector;
}
