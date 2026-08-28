import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db";
import { UserSettingsService } from "../services/userSettingsService";
import { EncryptionService } from "../services/encryptionService";
import { OpenRouterKeyValidator, maskKey } from "../services/ai/keyValidator";
import { requireAuth, type AppVariables } from "../auth/middleware";
import { saveApiKeySchema } from "../schemas";
import type { Env } from "../env";

const settings = new Hono<{ Bindings: Env; Variables: AppVariables }>();

settings.use("*", requireAuth);

// ---- GET /api/settings/ai ------------------------------------------------

settings.get("/ai", async (c) => {
  const userId = c.get("userId");
  const service = new UserSettingsService(getDb(c.env));
  const row = await service.get(userId);

  if (!row) {
    return c.json({ provider: "platform", key: null, keyStatus: null });
  }

  return c.json({
    provider: row.aiProvider,
    key: row.apiKeyHint ?? null,
    keyStatus: row.apiKeyStatus ?? null,
  });
});

// ---- POST /api/settings/ai/key -------------------------------------------

settings.post("/ai/key", zValidator("json", saveApiKeySchema), async (c) => {
  const userId = c.get("userId");
  const { key } = c.req.valid("json");

  // Validate the key against OpenRouter.
  const validator = new OpenRouterKeyValidator();
  const result = await validator.validate(key);
  if (!result.ok) {
    return c.json({ error: result.reason }, 400);
  }

  // Check that the KEK secret is configured.
  const kek = c.env.BYOK_KEK_V1;
  if (!kek) {
    return c.json(
      {
        error:
          "BYOK is not configured on this server. Set the BYOK_KEK_V1 secret.",
      },
      503,
    );
  }

  // Encrypt the validated key.
  const encryption = new EncryptionService(kek);
  const { ciphertext, iv, version } = await encryption.encrypt(result.key);

  // Store encrypted key and switch provider.
  const service = new UserSettingsService(getDb(c.env));
  await service.upsert(userId, {
    aiProvider: "byok",
    encryptedApiKey: ciphertext,
    apiKeyIv: iv,
    apiKeyVersion: version,
    apiKeyHint: maskKey(result.key),
    apiKeyStatus: "valid",
    apiKeyVerifiedAt: new Date(),
  });

  return c.json(
    { provider: "byok", key: maskKey(result.key), keyStatus: "valid" },
    201,
  );
});

// ---- DELETE /api/settings/ai/key -----------------------------------------

settings.delete("/ai/key", async (c) => {
  const userId = c.get("userId");
  const service = new UserSettingsService(getDb(c.env));
  await service.clearKey(userId);
  return c.json({ provider: "platform", key: null, keyStatus: null });
});

export default settings;
