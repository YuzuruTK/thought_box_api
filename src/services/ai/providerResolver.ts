/**
 * ProviderResolver — selects and manages the AI provider per user.
 *
 * Decision logic:
 *  1. ai_provider == "byok" with a valid stored key → user OpenRouter BYOK
 *  2. otherwise → Cloudflare Workers AI (primary platform provider)
 *
 * Platform fallback:
 *  - Workers AI rate limits, access denial/free-tier exhaustion and 5xx errors
 *    fall back once to the direct Gemini platform provider.
 *
 * OpenRouter is never selected as the platform default.
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
  WorkersAIProvider,
  type WorkersAiBinding,
} from "./providers";
import { AiProviderError, AiTimeoutError } from "./openrouter";

export interface ProviderResolverDeps {
  settings: UserSettingsService;
  encryption: EncryptionService | null;
  platformKey: string;
  model: string;
  platformModel?: string;
  workersAi: WorkersAiBinding;
  workersAiModel: string;
}

export function createResolverDeps(env: Env): ProviderResolverDeps {
  const db = getDb(env);
  return {
    settings: new UserSettingsService(db),
    encryption: env.BYOK_KEK_V1
      ? new EncryptionService(env.BYOK_KEK_V1)
      : null,
    platformKey: env.GEMINI_API_KEY,
    model: env.OPENROUTER_MODEL ?? "openrouter/free",
    platformModel: env.GEMINI_MODEL,
    workersAi: env.AI,
    workersAiModel: env.WORKERS_AI_MODEL,
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

    try {
      const result = await resolved.provider.complete(request);
      return { result, kind: resolved.kind };
    } catch (error) {
      if (
        resolved.kind === "byok" &&
        error instanceof AiProviderError &&
        (error.status === 401 || error.status === 403)
      ) {
        await this.markKeyInvalid(userId);
        return this.completeWithGemini(request);
      }

      if (
        resolved.provider instanceof WorkersAIProvider &&
        this.shouldFallbackToGemini(error)
      ) {
        console.warn(
          "[ai] Workers AI unavailable; falling back to Gemini standby provider",
        );
        return this.completeWithGemini(request);
      }

      this.annotateError(error, resolved.kind);
      throw error;
    }
  }

  private async completeWithGemini(
    request: CompletionRequest,
  ): Promise<{ result: CompletionResult; kind: string }> {
    const fallback = this.makeGemini();
    try {
      const result = await fallback.provider.complete(request);
      return { result, kind: "platform" };
    } catch (fallbackError) {
      this.annotateError(fallbackError, "platform");
      throw fallbackError;
    }
  }

  private makePlatform(): ResolvedProvider {
    // Keep direct construction/backwards-compatible tests working when the
    // optional Workers AI binding is not supplied. Real Worker requests always
    // receive env.AI from the Wrangler binding.
    if (!this.deps.workersAi) return this.makeGemini();

    return {
      provider: new WorkersAIProvider(
        this.deps.workersAi,
        this.deps.workersAiModel,
      ),
      kind: "platform",
    };
  }

  private makeGemini(): ResolvedProvider {
    return {
      provider: new PlatformGeminiProvider(
        this.deps.platformKey,
        this.deps.platformModel ?? this.deps.model,
      ),
      kind: "platform",
    };
  }

  private shouldFallbackToGemini(error: unknown): boolean {
    if (error instanceof AiTimeoutError) return true;
    if (!(error instanceof AiProviderError)) return false;
    if (error.status === 403 || error.status === 429) return true;
    if (error.status !== undefined && error.status >= 500) return true;

    // Cloudflare may expose provider-specific errors without an HTTP status.
    // 3040 is the documented out-of-capacity code; 5035 is used for models
    // unavailable on the current plan. Both should activate the standby.
    if (error.providerCode === 3040 || error.providerCode === 5035) return true;

    const message = error.message.toLowerCase();
    return message.includes("out of capacity") || message.includes("rate limit");
  }

  private annotateError(error: unknown, kind: "platform" | "byok"): void {
    if (error instanceof AiProviderError || error instanceof AiTimeoutError) {
      error.providerKind = kind;
    }
  }
}
