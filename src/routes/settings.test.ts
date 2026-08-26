import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import settings from "./settings";
import type { Env } from "../env";
import type { AppVariables } from "../auth/middleware";

// ---- mock getDb ------------------------------------------------------------
const mockDb = {};
vi.mock("../db", () => ({
  getDb: vi.fn(() => mockDb),
}));

// ---- mock UserSettingsService ----------------------------------------------
let mockServiceMethods: {
  get: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  clearKey: ReturnType<typeof vi.fn>;
};

vi.mock("../services/userSettingsService", async () => {
  const actual = await vi.importActual("../services/userSettingsService");
  return {
    ...actual,
    UserSettingsService: class {
      get = mockServiceMethods.get;
      upsert = mockServiceMethods.upsert;
      clearKey = mockServiceMethods.clearKey;
    },
  };
});

// ---- mock OpenRouterKeyValidator -------------------------------------------
let mockValidate: ReturnType<typeof vi.fn>;
vi.mock("../services/ai/keyValidator", async () => {
  const actual = await vi.importActual("../services/ai/keyValidator");
  return {
    ...actual,
    OpenRouterKeyValidator: class {
      validate = mockValidate;
    },
  };
});

// ---- mock EncryptionService ------------------------------------------------
let mockEncrypt: ReturnType<typeof vi.fn>;
vi.mock("../services/encryptionService", async () => {
  const actual = await vi.importActual("../services/encryptionService");
  return {
    ...actual,
    EncryptionService: class {
      constructor(_kek: string) { /* noop */ }
      encrypt = mockEncrypt;
    },
  };
});

// ---- test helpers ----------------------------------------------------------

import { signJwt } from "../auth/jwt";

const JWT_SECRET = "test-jwt-secret-for-settings-tests";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    JWT_SECRET,
    OPENROUTER_API_KEY: "sk-or-v1-platform",
    AI_MODEL: "test:free",
    ...overrides,
  };
}

function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
  app.route("/api/settings", settings);
  return app;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function makeToken(): Promise<string> {
  return signJwt(JWT_SECRET, 1);
}

async function makeTokenInvalidSecret(): Promise<string> {
  return signJwt("wrong-secret", 1);
}

describe("Settings API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockServiceMethods = {
      get: vi.fn(),
      upsert: vi.fn(),
      clearKey: vi.fn(),
    };
    mockValidate = vi.fn();
    mockEncrypt = vi.fn();
  });

  // ---- GET /api/settings/ai -----------------------------------------------

  it("returns platform defaults when no settings row exists", async () => {
    mockServiceMethods.get.mockResolvedValue(null);
    const app = createApp();
    const env = makeEnv();
    const token = await makeToken();
    const res = await app.request(
      "/api/settings/ai",
      { headers: authHeaders(token) },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ provider: "platform", key: null, keyStatus: null });
  });

  it("returns byok settings when configured", async () => {
    mockServiceMethods.get.mockResolvedValue({
      userId: 1,
      aiProvider: "byok",
      apiKeyHint: "sk-or-v1…abcd",
      apiKeyStatus: "valid",
    });
    const app = createApp();
    const env = makeEnv();
    const token = await makeToken();
    const res = await app.request(
      "/api/settings/ai",
      { headers: authHeaders(token) },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      provider: "byok",
      key: "sk-or-v1…abcd",
      keyStatus: "valid",
    });
  });

  it("returns 401 without auth header", async () => {
    const app = createApp();
    const env = makeEnv();
    const res = await app.request("/api/settings/ai", undefined, env);
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    const app = createApp();
    const env = makeEnv();
    const res = await app.request(
      "/api/settings/ai",
      { headers: { Authorization: "Bearer invalid.token.here" } },
      env,
    );
    expect(res.status).toBe(401);
  });

  // ---- POST /api/settings/ai/key ------------------------------------------

  it("saves a validated key and returns masked hint", async () => {
    mockValidate.mockResolvedValue({
      ok: true,
      key: "sk-or-v1-1234567890abcdef1234567890abcdef",
    });
    mockEncrypt.mockResolvedValue({
      ciphertext: "encrypted-base64",
      iv: "iv-base64",
      version: 1,
    });
    mockServiceMethods.upsert.mockResolvedValue({});

    const app = createApp();
    const env = makeEnv({ BYOK_KEK_V1: "YWJjZGVmZ2hpamtsbW5vcDAxMjM0NTY3ODlhYmNkZWY=" });
    const token = await makeToken();
    const res = await app.request(
      "/api/settings/ai/key",
      {
        method: "POST",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: "sk-or-v1-1234567890abcdef1234567890abcdef",
        }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.provider).toBe("byok");
    expect(body.keyStatus).toBe("valid");
    expect(body.key).not.toContain("1234567890abcdef");
    expect(body.key).toContain("…");
  });

  it("returns 400 for invalid key", async () => {
    mockValidate.mockResolvedValue({
      ok: false,
      reason: "OpenRouter rejected this key.",
    });

    const app = createApp();
    const env = makeEnv();
    const token = await makeToken();
    const res = await app.request(
      "/api/settings/ai/key",
      {
        method: "POST",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: "sk-or-v1-bad" }),
      },
      env,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toContain("OpenRouter rejected this key");
  });

  it("returns 503 when BYOK_KEK_V1 is not configured", async () => {
    mockValidate.mockResolvedValue({
      ok: true,
      key: "sk-or-v1-1234567890abcdef1234567890abcdef",
    });

    const app = createApp();
    const env = makeEnv(); // no BYOK_KEK_V1
    const token = await makeToken();
    const res = await app.request(
      "/api/settings/ai/key",
      {
        method: "POST",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: "sk-or-v1-1234567890abcdef1234567890abcdef",
        }),
      },
      env,
    );

    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toContain("BYOK is not configured");
  });

  it("returns 401 for POST without auth", async () => {
    const app = createApp();
    const env = makeEnv();
    const res = await app.request(
      "/api/settings/ai/key",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "sk-or-v1-1234567890abcdef1234567890abcdef",
        }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  // ---- DELETE /api/settings/ai/key ----------------------------------------

  it("deletes the key and returns platform settings", async () => {
    mockServiceMethods.clearKey.mockResolvedValue(undefined);

    const app = createApp();
    const env = makeEnv();
    const token = await makeToken();
    const res = await app.request(
      "/api/settings/ai/key",
      {
        method: "DELETE",
        headers: authHeaders(token),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ provider: "platform", key: null, keyStatus: null });
    expect(mockServiceMethods.clearKey).toHaveBeenCalledWith(1);
  });

  it("returns 401 for DELETE without auth", async () => {
    const app = createApp();
    const env = makeEnv();
    const res = await app.request(
      "/api/settings/ai/key",
      { method: "DELETE" },
      env,
    );
    expect(res.status).toBe(401);
  });
});
