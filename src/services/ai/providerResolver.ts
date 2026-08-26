import type { Env } from "../../env";
import { getDb } from "../../db";
import { UserSettingsService } from "../userSettingsService";
import { EncryptionService } from "../encryptionService";
import { type AiProvider, type CompletionRequest, type CompletionResult, PlatformOpenRouterProvider, UserOpenRouterProvider } from "./providers";
import { AiProviderError, AiTimeoutError } from "./openrouter";

export interface ProviderResolverDeps {
  settings: UserSettingsService;
  encryption: EncryptionService | null;
  platformKey: string;
  model: string;
}

export function createResolverDeps(env: Env): ProviderResolverDeps {
  const db = getDb(env);
  return { settings: new UserSettingsService(db), encryption: env.BYOK_KEK_V1 ? new EncryptionService(env.BYOK_KEK_V1) : null, platformKey: env.OPENROUTER_API_KEY, model: env.AI_MODEL };
}

export interface ResolvedProvider { provider: AiProvider; kind: "platform" | "byok"; }

export class ProviderResolver {
  constructor(private readonly deps: ProviderResolverDeps) {}

  async resolve(userId: number): Promise<ResolvedProvider> {
    const row = await this.deps.settings.get(userId);
    if (!row || row.aiProvider !== "byok") return this.makePlatform();
    if (!this.deps.encryption || !row.encryptedApiKey || !row.apiKeyIv || row.apiKeyStatus === "invalid") return this.makePlatform();
    try {
      const plaintext = await this.deps.encryption.decrypt(row.encryptedApiKey, row.apiKeyIv);
      return { provider: new UserOpenRouterProvider(plaintext, this.deps.model), kind: "byok" };
    } catch (error) {
      console.warn(`[byok] user ${userId}: failed to decrypt stored key`, error instanceof Error ? error.message : error);
      return this.makePlatform();
    }
  }

  async markKeyInvalid(userId: number): Promise<void> {
    await this.deps.settings.upsert(userId, { aiProvider: "platform", apiKeyStatus: "invalid" });
  }

  async complete(userId: number, request: CompletionRequest): Promise<{ result: CompletionResult; kind: string }> {
    const resolved = await this.resolve(userId);
    try {
      const result = await resolved.provider.complete(request);
      return { result, kind: resolved.kind };
    } catch (error) {
      if (resolved.kind === "byok" && error instanceof AiProviderError && (error.status === 401 || error.status === 403)) {
        await this.markKeyInvalid(userId);
        const fallback = this.makePlatform();
        try {
          const result = await fallback.provider.complete(request);
          return { result, kind: "platform" };
        } catch (fallbackError) {
          if (fallbackError instanceof AiProviderError || fallbackError instanceof AiTimeoutError) fallbackError.providerKind = "platform";
          throw fallbackError;
        }
      }
      if (error instanceof AiProviderError || error instanceof AiTimeoutError) error.providerKind = resolved.kind;
      throw error;
    }
  }

  private makePlatform(): ResolvedProvider {
    return { provider: new PlatformOpenRouterProvider(this.deps.platformKey, this.deps.model), kind: "platform" };
  }
}
