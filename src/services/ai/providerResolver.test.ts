import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ProviderResolver,
  type ProviderResolverDeps,
} from "./providerResolver";
import { UserSettingsService } from "../userSettingsService";
import { EncryptionService } from "../encryptionService";
import {
  AiProviderError,
  AiTimeoutError,
} from "./openrouter";
import type { UserSettings } from "../../db/schema";

// ---- helpers -------------------------------------------------------------

const FAKE_PLATFORM_KEY = "sk-or-v1-platform-key-for-testing-only-0000";
const FAKE_USER_KEY = "sk-or-v1-user-personal-key-for-testing-only";
const MODEL = "test-model:free";

/** Base64-encoded 32-byte key ("BYOK12345678901234567890123456"). */
const KEK_B64 = "YWJjZGVmZ2hpamtsbW5vcDAxMjM0NTY3ODlhYmNkZWY=";

function makeRow(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    userId: 1,
    aiProvider: "platform",
    encryptedApiKey: null,
    apiKeyIv: null,
    apiKeyVersion: null,
    apiKeyHint: null,
    apiKeyStatus: null,
    apiKeyVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function encryptKey(kek: string, key: string) {
  const svc = new EncryptionService(kek);
  return svc.encrypt(key);
}

interface MockDeps {
  settings: { get: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
  encryption: EncryptionService | null;
  deps: ProviderResolverDeps;
}

function setup(opts: {
  encryption?: EncryptionService | null;
  rows?: UserSettings | null;
}): MockDeps {
  const get = vi.fn().mockResolvedValue(opts.rows ?? null);
  const upsert = vi.fn().mockResolvedValue(undefined);
  const settings = {
    get,
    upsert,
  } as unknown as UserSettingsService;

  const deps: ProviderResolverDeps = {
    settings,
    encryption: opts.encryption !== undefined ? opts.encryption : null,
    platformKey: FAKE_PLATFORM_KEY,
    model: MODEL,
  };

  return { settings: { get, upsert }, encryption: deps.encryption, deps };
}

// ---- tests ---------------------------------------------------------------

describe("ProviderResolver", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  // --- resolve -----------------------------------------------------------

  it("selects platform provider when no settings row exists", async () => {
    const { deps } = setup({ rows: null });
    const r = new ProviderResolver(deps);
    const result = await r.resolve(1);
    expect(result.kind).toBe("platform");
    expect(result.provider.kind).toBe("platform");
  });

  it("selects platform provider when ai_provider is platform", async () => {
    const { deps } = setup({ rows: makeRow({ aiProvider: "platform" }) });
    const r = new ProviderResolver(deps);
    const result = await r.resolve(1);
    expect(result.kind).toBe("platform");
  });

  it("selects platform when BYOK is enabled but encryption service is absent", async () => {
    const { deps } = setup({
      encryption: null,
      rows: makeRow({ aiProvider: "byok", encryptedApiKey: "...", apiKeyIv: "..." }),
    });
    const r = new ProviderResolver(deps);
    const result = await r.resolve(1);
    expect(result.kind).toBe("platform");
  });

  it("selects platform when BYOK is enabled but encrypted key is missing", async () => {
    const encryption = new EncryptionService(KEK_B64);
    const { deps } = setup({
      encryption,
      rows: makeRow({ aiProvider: "byok", encryptedApiKey: null, apiKeyIv: null }),
    });
    const r = new ProviderResolver(deps);
    const result = await r.resolve(1);
    expect(result.kind).toBe("platform");
  });

  it("selects platform when BYOK is enabled but key status is invalid", async () => {
    const encryption = new EncryptionService(KEK_B64);
    const { deps } = setup({
      encryption,
      rows: makeRow({
        aiProvider: "byok",
        encryptedApiKey: "enc",
        apiKeyIv: "iv",
        apiKeyStatus: "invalid",
      }),
    });
    const r = new ProviderResolver(deps);
    const result = await r.resolve(1);
    expect(result.kind).toBe("platform");
  });

  it("selects byok when key is stored and status is valid", async () => {
    const encryption = new EncryptionService(KEK_B64);
    const enc = await encryptKey(KEK_B64, FAKE_USER_KEY);
    const { deps } = setup({
      encryption,
      rows: makeRow({
        aiProvider: "byok",
        encryptedApiKey: enc.ciphertext,
        apiKeyIv: enc.iv,
        apiKeyVersion: enc.version,
        apiKeyStatus: "valid",
      }),
    });
    const r = new ProviderResolver(deps);
    const result = await r.resolve(1);
    expect(result.kind).toBe("byok");
    expect(result.provider.kind).toBe("byok");
  });

  it("selects platform when decryption fails", async () => {
    const encryption = new EncryptionService(KEK_B64);
    const { deps } = setup({
      encryption,
      rows: makeRow({
        aiProvider: "byok",
        encryptedApiKey: "not-valid-ciphertext",
        apiKeyIv: "not-valid-iv",
        apiKeyStatus: "valid",
      }),
    });
    const r = new ProviderResolver(deps);
    const result = await r.resolve(1);
    expect(result.kind).toBe("platform");
  });

  // --- markKeyInvalid -----------------------------------------------------

  it("markKeyInvalid sets provider to platform and status to invalid", async () => {
    const { deps, settings } = setup({ rows: null });
    const r = new ProviderResolver(deps);
    await r.markKeyInvalid(1);
    expect(settings.upsert).toHaveBeenCalledWith(1, {
      aiProvider: "platform",
      apiKeyStatus: "invalid",
    });
  });

  // --- complete: fallback on 401 / 403 ------------------------------------

  it("falls back to platform on 401 from BYOK key and marks key invalid", async () => {
    const encryption = new EncryptionService(KEK_B64);
    const enc = await encryptKey(KEK_B64, FAKE_USER_KEY);
    const { deps, settings } = setup({
      encryption,
      rows: makeRow({
        aiProvider: "byok",
        encryptedApiKey: enc.ciphertext,
        apiKeyIv: enc.iv,
        apiKeyVersion: enc.version,
        apiKeyStatus: "valid",
      }),
    });
    const r = new ProviderResolver(deps);

    // Mock fetch: 401 for user key, 200 for platform
    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({ error: { code: 401, message: "bad credentials" } }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "Hello from platform" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await r.complete(1, { prompt: "Hi", maxTokens: 100 });

    expect(result.kind).toBe("platform");
    expect(result.result.content).toBe("Hello from platform");
    expect(settings.upsert).toHaveBeenCalledWith(1, {
      aiProvider: "platform",
      apiKeyStatus: "invalid",
    });
    expect(callCount).toBe(2); // exactly one retry

    fetchSpy.mockRestore();
  });

  it("falls back to platform on 403 from BYOK key", async () => {
    const encryption = new EncryptionService(KEK_B64);
    const enc = await encryptKey(KEK_B64, FAKE_USER_KEY);
    const { deps, settings } = setup({
      encryption,
      rows: makeRow({
        aiProvider: "byok",
        encryptedApiKey: enc.ciphertext,
        apiKeyIv: enc.iv,
        apiKeyVersion: enc.version,
        apiKeyStatus: "valid",
      }),
    });
    const r = new ProviderResolver(deps);

    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({ error: { code: 403, message: "forbidden" } }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "Fallback OK" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await r.complete(1, { prompt: "Hi", maxTokens: 100 });
    expect(result.kind).toBe("platform");
    expect(settings.upsert).toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  // --- complete: NO fallback on non-401/403 errors ------------------------

  it("does NOT fallback on 429 — throws 429 untouched", async () => {
    const encryption = new EncryptionService(KEK_B64);
    const enc = await encryptKey(KEK_B64, FAKE_USER_KEY);
    const { deps, settings } = setup({
      encryption,
      rows: makeRow({
        aiProvider: "byok",
        encryptedApiKey: enc.ciphertext,
        apiKeyIv: enc.iv,
        apiKeyVersion: enc.version,
        apiKeyStatus: "valid",
      }),
    });
    const r = new ProviderResolver(deps);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({ error: { code: 429, message: "rate limit" } }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    });

    await expect(
      r.complete(1, { prompt: "Hi", maxTokens: 100 }),
    ).rejects.toThrow("AI provider rate limit reached");

    expect(settings.upsert).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("does NOT fallback on platform error — rethrows", async () => {
    const { deps, settings } = setup({
      rows: makeRow({ aiProvider: "platform" }),
    });
    const r = new ProviderResolver(deps);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({ error: { code: 500, message: "server error" } }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    });

    await expect(
      r.complete(1, { prompt: "Hi", maxTokens: 100 }),
    ).rejects.toThrow();

    expect(settings.upsert).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("does NOT fallback on timeout — throws AiTimeoutError", async () => {
    const encryption = new EncryptionService(KEK_B64);
    const enc = await encryptKey(KEK_B64, FAKE_USER_KEY);
    const { deps, settings } = setup({
      encryption,
      rows: makeRow({
        aiProvider: "byok",
        encryptedApiKey: enc.ciphertext,
        apiKeyIv: enc.iv,
        apiKeyVersion: enc.version,
        apiKeyStatus: "valid",
      }),
    });
    const r = new ProviderResolver(deps);

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new DOMException("aborted", "AbortError"));

    await expect(
      r.complete(1, { prompt: "Hi", maxTokens: 100 }),
    ).rejects.toThrow("AI request timed out");

    expect(settings.upsert).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("does NOT fallback on 503 from BYOK", async () => {
    const encryption = new EncryptionService(KEK_B64);
    const enc = await encryptKey(KEK_B64, FAKE_USER_KEY);
    const { deps, settings } = setup({
      encryption,
      rows: makeRow({
        aiProvider: "byok",
        encryptedApiKey: enc.ciphertext,
        apiKeyIv: enc.iv,
        apiKeyVersion: enc.version,
        apiKeyStatus: "valid",
      }),
    });
    const r = new ProviderResolver(deps);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({ error: { code: 503 } }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    });

    await expect(
      r.complete(1, { prompt: "Hi", maxTokens: 100 }),
    ).rejects.toThrow("AI provider returned an error");

    expect(settings.upsert).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("does NOT fallback on 504 from BYOK", async () => {
    const encryption = new EncryptionService(KEK_B64);
    const enc = await encryptKey(KEK_B64, FAKE_USER_KEY);
    const { deps, settings } = setup({
      encryption,
      rows: makeRow({
        aiProvider: "byok",
        encryptedApiKey: enc.ciphertext,
        apiKeyIv: enc.iv,
        apiKeyVersion: enc.version,
        apiKeyStatus: "valid",
      }),
    });
    const r = new ProviderResolver(deps);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response("gateway timeout", { status: 504 });
    });

    await expect(
      r.complete(1, { prompt: "Hi", maxTokens: 100 }),
    ).rejects.toThrow("AI provider returned an error");

    expect(settings.upsert).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("passes through platform provider success without touching settings", async () => {
    const { deps, settings } = setup({ rows: null });
    const r = new ProviderResolver(deps);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "Platform wins" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const res = await r.complete(1, { prompt: "Hi", maxTokens: 100 });
    expect(res.kind).toBe("platform");
    expect(res.result.content).toBe("Platform wins");
    expect(settings.upsert).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("passes through BYOK provider success", async () => {
    const encryption = new EncryptionService(KEK_B64);
    const enc = await encryptKey(KEK_B64, FAKE_USER_KEY);
    const { deps } = setup({
      encryption,
      rows: makeRow({
        aiProvider: "byok",
        encryptedApiKey: enc.ciphertext,
        apiKeyIv: enc.iv,
        apiKeyVersion: enc.version,
        apiKeyStatus: "valid",
      }),
    });
    const r = new ProviderResolver(deps);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "BYOK rocks" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const res = await r.complete(1, { prompt: "Hi", maxTokens: 100 });
    expect(res.kind).toBe("byok");
    expect(res.result.content).toBe("BYOK rocks");

    fetchSpy.mockRestore();
  });
});
