import type { Env } from "../../env";
import { getDb } from "../../db";
import { EncryptionService } from "../encryptionService";
import { UserSettingsService } from "../userSettingsService";
import { PlatformOpenRouterProvider, UserOpenRouterProvider, type AiProvider } from "./providers";

export class ProviderResolver {
  private readonly settings: UserSettingsService;

  constructor(private readonly env: Env) {
    this.settings = new UserSettingsService(getDb(env));
  }

  async resolve(userId: number): Promise<AiProvider> {
    const platform = this.platformProvider();
    const settings = await this.settings.get(userId);
    if (settings?.aiProvider !== "byok" || !settings.encryptedApiKey || !settings.apiKeyIv) return platform;
    if (settings.apiKeyStatus === "invalid" || settings.apiKeyStatus === "revoked") return platform;
    if (!this.env.BYOK_KEK_V1) return platform;

    try {
      const encryption = new EncryptionService(this.env.BYOK_KEK_V1);
      const key = await encryption.decrypt(settings.encryptedApiKey, settings.apiKeyIv);
      return new UserOpenRouterProvider(key, this.env.AI_MODEL);
    } catch {
      await this.settings.upsert(userId, { aiProvider: "platform", apiKeyStatus: "invalid" });
      return platform;
    }
  }

  async fallbackToPlatform(userId: number): Promise<AiProvider> {
    await this.settings.upsert(userId, { aiProvider: "platform", apiKeyStatus: "invalid" });
    return this.platformProvider();
  }

  private platformProvider(): AiProvider {
    return new PlatformOpenRouterProvider(this.env.OPENROUTER_API_KEY, this.env.AI_MODEL);
  }
}
