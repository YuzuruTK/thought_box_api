import { eq } from "drizzle-orm";
import type { Database } from "../db";
import { userSettings, type UserSettings } from "../db/schema";

/**
 * UserSettingsService — persistence for per-user AI settings (BYOK).
 * Handles the "no row yet" case: a missing row means platform mode.
 */
export class UserSettingsService {
  constructor(private readonly db: Database) {}

  /** Load a user's settings row, or null if they've never configured anything. */
  async get(userId: number): Promise<UserSettings | null> {
    const [row] = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    return row ?? null;
  }

  /** Insert (`aiProvider`/key fields) regardless of existing row. */
  async upsert(userId: number, partial: Partial<UserSettings>): Promise<UserSettings> {
    const [row] = await this.db
      .insert(userSettings)
      .values({ userId, ...partial, updatedAt: new Date() })
      .onConflictDoUpdate({ target: userSettings.userId, set: partial })
      .returning();
    return row as UserSettings;
  }

  /** Wipe the API key fields and revert to platform provider. */
  async clearKey(userId: number): Promise<void> {
    await this.db
      .update(userSettings)
      .set({
        aiProvider: "platform",
        encryptedApiKey: null,
        apiKeyIv: null,
        apiKeyVersion: null,
        apiKeyHint: null,
        apiKeyStatus: null,
        apiKeyVerifiedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(userSettings.userId, userId));
  }
}