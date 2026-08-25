import { Hono } from "hono";
import { getDb } from "../db";
import type { Env } from "../env";
import { requireAuth, type AppVariables } from "../auth/middleware";
import { EncryptionService } from "../services/encryptionService";
import { OpenRouterKeyValidator, maskKey } from "../services/ai/keyValidator";
import { UserSettingsService } from "../services/userSettingsService";

const settings = new Hono<{ Bindings: Env; Variables: AppVariables }>();
settings.use("*", requireAuth);

settings.get("/ai", async (c) => {
  const userId = c.get("userId");
  const row = await new UserSettingsService(getDb(c.env)).get(userId);
  return c.json({
    provider: row?.aiProvider ?? "platform",
    key: row?.apiKeyHint ?? null,
    keyStatus: row?.apiKeyStatus ?? null,
    keyVerifiedAt: row?.apiKeyVerifiedAt ?? null,
  });
});

settings.post("/ai/key", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ apiKey?: unknown }>();
  if (typeof body.apiKey !== "string" || body.apiKey.trim().length === 0) {
    return c.json({ error: "apiKey is required." }, 400);
  }

  const validation = await new OpenRouterKeyValidator().validate(body.apiKey);
  if (!validation.ok) {
    return c.json({ error: validation.reason }, 400);
  }

  const encryption = new EncryptionService(c.env.BYOK_KEK_V1);
  const encrypted = await encryption.encrypt(validation.key);
  const now = new Date();
  await new UserSettingsService(getDb(c.env)).upsert(userId, {
    aiProvider: "byok",
    encryptedApiKey: encrypted.ciphertext,
    apiKeyIv: encrypted.iv,
    apiKeyVersion: encrypted.version,
    apiKeyHint: maskKey(validation.key),
    apiKeyStatus: "valid",
    apiKeyVerifiedAt: now,
  });

  return c.json({
    provider: "byok",
    key: maskKey(validation.key),
    keyStatus: "valid",
    keyVerifiedAt: now,
  }, 200);
});

settings.delete("/ai/key", async (c) => {
  const userId = c.get("userId");
  const service = new UserSettingsService(getDb(c.env));
  await service.clearKey(userId);
  await service.upsert(userId, { aiProvider: "platform" });
  return c.json({ provider: "platform", key: null, keyStatus: null });
});

export default settings;
