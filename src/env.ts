/**
 * Cloudflare Worker bindings and environment variables.
 */
export interface Env {
  /** D1 database binding (see wrangler.jsonc). */
  DB: D1Database;
  /** Secret used to sign/verify JWTs (set via `wrangler secret put JWT_SECRET`). */
  JWT_SECRET: string;
  /** Google Gemini API key (set via `wrangler secret put GEMINI_API_KEY`). */
  GEMINI_API_KEY: string;
  /** Gemini model identifier, e.g. "gemini-3.7-flash". */
  GEMINI_MODEL: string;
  /**
   * Legacy platform OpenRouter key. Kept optional for compatibility with
   * older deployments and direct provider consumers; the default resolver
   * no longer uses it.
   */
  OPENROUTER_API_KEY?: string;
  /** OpenRouter model used by the existing personal-key BYOK path. */
  OPENROUTER_MODEL?: string;
  /** BYOK master encryption key (set via `wrangler secret put BYOK_KEK_V1`). */
  BYOK_KEK_V1?: string;
}
