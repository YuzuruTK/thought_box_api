/**
 * Cloudflare Worker bindings and environment variables.
 */
export interface Env {
  /** D1 database binding (see wrangler.jsonc). */
  DB: D1Database;
  /** Workers AI binding. */
  AI: Ai;
  /** Secret used to sign/verify JWTs (set via `wrangler secret put JWT_SECRET`). */
  JWT_SECRET: string;
  /** Google Gemini API key used as the platform standby provider. */
  GEMINI_API_KEY: string;
  /** Gemini model identifier used by the standby provider. */
  GEMINI_MODEL: string;
  /** Cloudflare Workers AI model used by the primary platform provider. */
  WORKERS_AI_MODEL: string;
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
