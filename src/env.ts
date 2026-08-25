/**
 * Cloudflare Worker bindings and environment variables.
 */
export interface Env {
  /** D1 database binding (see wrangler.jsonc). */
  DB: D1Database;
  /** Secret used to sign/verify JWTs (set via `wrangler secret put JWT_SECRET`). */
  JWT_SECRET: string;
  /** OpenRouter API key used by the platform provider. */
  OPENROUTER_API_KEY: string;
  /** Base64-encoded 32-byte KEK used to encrypt user OpenRouter keys. */
  BYOK_KEK_V1: string;
  /** OpenRouter model identifier, e.g. "google/gemma-3-27b-it:free". */
  AI_MODEL: string;
}
