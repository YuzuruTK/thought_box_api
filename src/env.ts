/**
 * Cloudflare Worker bindings and environment variables.
 */
export interface Env {
  /** D1 database binding (see wrangler.jsonc). */
  DB: D1Database;
  /** Secret used to sign/verify JWTs (set via `wrangler secret put JWT_SECRET`). */
  JWT_SECRET: string;
  /** OpenRouter API key (set via `wrangler secret put OPENROUTER_API_KEY`). */
  OPENROUTER_API_KEY: string;
  /** OpenRouter model identifier, e.g. "google/gemma-3-27b-it:free". */
  AI_MODEL: string;
  /** BYOK master encryption key (set via `wrangler secret put BYOK_KEK_V1`). */
  BYOK_KEK_V1?: string;
}