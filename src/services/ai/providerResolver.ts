/**
 * ProviderResolver — selects and manages the AI provider per user.
 *
 * Decision logic:
 *  1. ai_provider != "byok"          → platform provider
 *  2. encrypted key missing          → platform provider (warn)
 *  3. api_key_status === "invalid"   → platform provider (warn)
 *  4. BYOK_KEK_V1 secret not set     → platform provider (warn)
 *  5. decrypt failure                → platform provider (warn)
 *  6. otherwise                      → user (BYOK) provider
 *
 * Fallback (in `complete`):
 *  - 401 / 403 on user key → mark invalid → retry once on platform provider.
 *  - 429, 5xx, timeout, network exhaustion → rethrow untouched.
 */

import type { Env } from "../../env";
import { getDb, type Database } from "../../db";
import { UserSettingsService } from "../userSettingsService";
import { EncryptionService, EncryptionError } from "../encryptionService";
import {
  type AiProvider,
  type CompletionRequest,
  type CompletionResult,
  PlatformOpenRouterProvider,
  UserOpenRouterProvider,
} from "./providers";
import { AiProviderError, AiTimeoutError } from "./openrouter";

// ---- dependencies interface (DI for testability) -------------------------

export interface ProviderResolverDeps {
  settings: UserSettingsService;
  encryption: EncryptionService | null;
  platformKey: string;
  model: string;
}

export function createResolverDeps(env: Env): ProviderResolverDeps {
  const db = getDb(env);
  return {
    settings: new UserSettingsService(db),
    encryption: env.BYOK_KEK_V1
      ? new EncryptionService(env.BYOK_KEK_V1)
      : null,
    platformKey: env.OPENROUTER_API_KEY,
    model: env.AI_MODEL,
  };
}

export interface ResolvedProvider {
  provider: AiProvider;
  kind: "platform" | "byok";
}

// ---- ProviderResolver ---------------------------------------------------

export class ProviderResolver {
  constructor(private readonly deps: ProviderResolverDeps) {}

  /**
   * Resolve which AI provider to use for a given user.
   * Returns the provider together with its stable kind for provenance.
   */
  async resolve(userId: number): Promise<ResolvedProvider> {
    const row = await this.deps.settings.get(userId);

    // No settings row, or aiProvider not set to "byok".
    if (!row || row.aiProvider !== "byok") {
      return this.makePlatform();
    }

    // Need an encryption service and a valid stored key.
    if (!this.deps.encryption) {
      console.warn(
        `[byok] user ${userId}: byok enabled but BYOK_KEK_V1 secret not configured`,
      );
      return this.makePlatform();
    }
    if (!row.encryptedApiKey || !row.apiKeyIv) {
      console.warn(
        `[byok] user ${userId}: byok enabled but encrypted key is missing`,
      );
      return this.makePlatform();
    }
    if (row.apiKeyStatus === "invalid") {
      console.warn(
        `[byok] user ${userId}: byok enabled but key status is "invalid"`,
      );
      return this.makePlatform();
    }

    try {
      const plaintext = await this.deps.encryption.decrypt(
        row.encryptedApiKey,
        row.apiKeyIv,
      );
      return {
        provider: new UserOpenRouterProvider(plaintext, this.deps.model),
        kind: "byok",
      };
    } catch (error) {
      console.warn(
        `[byok] user ${userId}: failed to decrypt stored key`,
        error instanceof Error ? error.message : error,
      );
      return this.makePlatform();
    }
  }

  /** Mark a user's key as invalid so further attempts skip BYOK. */
  async markKeyInvalid(userId: number): Promise<void> {
    await this.deps.settings.upsert(userId, {
      aiProvider: "platform",
      apiKeyStatus: "invalid",
    });
    console.warn(`[byok] user ${userId}: key marked invalid after 401/403`);
  }

  /**
   * Execute a completion with fallback logic:
   *  - BYOK 401/403 → mark key invalid → retry once on platform.
   *  - Everything else → rethrow untouched.
   */
  async complete(
    userId: number,
    request: CompletionRequest,
  ): Promise<{ result: CompletionResult; kind: string }> {
    const resolved = await this.resolve(userId);
    const p = resolved.provider;

    try {
      const result = await p.complete(request);
      return { result, kind: resolved.kind };
    } catch (error) {
      // Only fallback on 401 / 403 when using a user key.
      if (
        resolved.kind === "byok" &&
        error instanceof AiProviderError &&
        (error.status === 401 || error.status === 403)
      ) {
        await this.markKeyInvalid(userId);
        const fallback = this.makePlatform();
        const result = await fallback.provider.complete(request);
        return { result, kind: "platform" };
      }
      throw error;
    }
  }

  // ---- helpers ----------------------------------------------------------

  private makePlatform(): ResolvedProvider {
    return {
      provider: new PlatformOpenRouterProvider(
        this.deps.platformKey,
        this.deps.model,
      ),
      kind: "platform",
    };
  }
}
