/**
 * Single place where Gemini models are configured. Every other module imports
 * models from here, so switching models is an environment change only.
 */
import { createGoogle } from "@ai-sdk/google";
import { env } from "../../env";
import { vectorIndexName as buildIndexName } from "./vector-index-name";

export const google = createGoogle({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });

/** Raw model identifiers, useful for logging and reports. */
export const modelIds = {
  chat: env.GEMINI_CHAT_MODEL,
  utility: env.GEMINI_UTILITY_MODEL,
  embedding: env.GEMINI_EMBEDDING_MODEL,
} as const;

/** Main conversational model used by the citizenship agent. */
export const chatModel = google(modelIds.chat);

/** Cheap model for reranking, classification, guards and eval judging. */
export const utilityModel = google(modelIds.utility);

/** Embedding model for ingestion and retrieval queries. */
export const embeddingModel = google.embedding(modelIds.embedding);

export const EMBEDDING_DIMENSIONS = env.EMBEDDING_DIMENSIONS;

/** Name of the pgvector index for the currently configured embedding setup. */
export function vectorIndexName(): string {
  return buildIndexName(modelIds.embedding, EMBEDDING_DIMENSIONS);
}
