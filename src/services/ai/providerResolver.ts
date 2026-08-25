import type { Env } from "../../env";
import { getDb } from "../../db";
import { EncryptionService } from "../encryptionService";
import { UserSettingsService } from "../userSettingsService";
import {
  PlatformOpenRouterProvider,
  UserOpenRouterProvider,
  type AiProvider,
} from "./providers";

/** Selects the provider for an authenticated user. */
export class ProviderResolver {
  private readonly settings: UserSettingsService;
  private readonly encryption: EncryptionService;

  constructor(private readonly env: Env) {
    this.settings = new UserSettingsService(getDb(env));
    this.encryption = new EncryptionService(env.BYOK_KEK_V1);
  }

  async resolve(userId: number): Promise<AiProvider> {
    const platform = new PlatformOpenRouterProvider(this.env.OPENROUTER_API_KEY, this.env.AI_MODEL);
    const settings = await this.settings.get(userId);

    if (settings?.aiProvider !== "byok" || !settings.encryptedApiKey || !settings.apiKeyIv) {
      return platform;
    }

    if (settings.apiKeyStatus === "invalid" || settings.apiKeyStatus === "revoked") {
      return platform;
    }

    try {
      const key = await this.encryption.decrypt(settings.encryptedApiKey, settings.apiKeyIv);
      return new UserOpenRouterProvider(key, this.env.AI_MODEL);
    } catch {
      await this.settings.upsert(userId, { aiProvider: "platform", apiKeyStatus: "invalid" });
      return platform;
    }
  }

  /** Persist a failed BYOK authentication and return the shared provider. */
  async fallbackToPlatform(userId: number): Promise<AiProvider> {
    await this.settings.upsert(userId, {
      aiProvider: "platform",
      apiKeyStatus: "invalid",
    });
    return new PlatformOpenRouterProvider(this.env.OPENROUTER_API_KEY, this.env.AI_MODEL);
  }
}
