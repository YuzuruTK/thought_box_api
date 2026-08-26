/**
 * ProviderResolver — selects and manages the AI provider per user.
 *
 * Decision logic:
 *  1. ai_provider != "byok"          → platform Gemini provider
 *  2. encrypted key missing          → platform Gemini provider (warn)
 *  3. api_key_status === "invalid"   → platform Gemini provider (warn)
 *  4. BYOK_KEK_V1 secret not set     → platform Gemini provider (warn)
 *  5. decrypt failure                → platform Gemini provider (warn)
 *  6. otherwise                      → user OpenRouter BYOK provider
 *
 * Fallback (in `complete`):
 *  - 401 / 403 on user key → mark invalid → retry once on platform Gemini.
 *  - 429, 5xx, timeout, network exhaustion → rethrow untouched.
 */

import type { Env } from "../../env";
import { getDb } from "../../db";
import { UserSettingsService } from "../userSettingsService";
import { EncryptionService } from "../encryptionService";
import {
  type AiProvider,
  type CompletionRequest,
  type CompletionResult,
  PlatformGeminiProvider,
  UserOpenRouterProvider,
} from "./providers";
import { AiProviderError, AiTimeoutError } from "./openrouter";

// ---- dependencies interface (DI for testability) -------------------------

export interface ProviderResolverDeps {
  settings: UserSettingsService;
  encryption: EncryptionService | null;
  /** Platform Gemini API key. */
  platformKey: string;
  /** Platform Gemini model identifier. */
  model: string;
}

export function createResolverDeps(env: Env): ProviderResolverDeps {
  const db = getDb(env);
  return {
    settings: new UserSettingsService(db),
    encryption: env.BYOK_KEK_V1
      ? new EncryptionService(env.BYOK_KEK_V1)
      : null,
    platformKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
  };
}

export interface ResolvedProvider {
  provider: AiProvider;
  kind: "platform" | "byok";
}

export class ProviderResolver {
  constructor(private readonly deps: ProviderResolverDeps) {}

  async resolve(userId: number): Promise<ResolvedProvider> {
    const row = await this.deps.settings.get(userId);

    if (!row || row.aiProvider !== "byok") {
      return this.makePlatform();
    }

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

  async markKeyInvalid(userId: number): Promise<void> {
    await this.deps.settings.upsert(userId, {
      aiProvider: "platform",
      apiKeyStatus: "invalid",
    });
    console.warn(`[byok] user ${userId}: key marked invalid after 401/403`);
  }

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
      if (
        resolved.kind === "byok" &&
        error instanceof AiProviderError &&
        (error.status === 401 || error.status === 403)
      ) {
        await this.markKeyInvalid(userId);
        const fallback = this.makePlatform();
        try {
          const result = await fallback.provider.complete(request);
          return { result, kind: "platform" };
        } catch (fallbackError) {
          if (
            fallbackError instanceof AiProviderError ||
            fallbackError instanceof AiTimeoutError
          ) {
            fallbackError.providerKind = "platform";
          }
          throw fallbackError;
        }
      }

      if (error instanceof AiProviderError || error instanceof AiTimeoutError) {
        error.providerKind = resolved.kind;
      }
      throw error;
    }
  }

  private makePlatform(): ResolvedProvider {
    return {
      provider: new PlatformGeminiProvider(
        this.deps.platformKey,
        this.deps.model,
      ),
      kind: "platform",
    };
  }
}
