// Dummy values so modules that validate the environment at import time can be
// unit-tested offline. No test may call Gemini or a real database through these.
process.env.GOOGLE_GENERATIVE_AI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
