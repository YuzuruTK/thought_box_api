import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  chatCompletion,
  AiProviderError,
  AiTimeoutError,
  type CompletionOptions,
} from "./openrouter";

const defaults: CompletionOptions = {
  apiKey: "sk-or-v1-00000000000000000000000000000000000000000000deadbeef",
  model: "test-model:free",
  messages: [{ role: "user", content: "Hello" }],
  maxTokens: 100,
};

function fakeResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers: h });
}

function assertNoKeyLeak(error: unknown, label: string): void {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes("sk-or-")) {
    throw new Error(`KEY LEAK [${label}]: ${text}`);
  }
}

function mockFetch(resp: () => Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(resp()));
}

function mockFetchReject(err: Error) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.reject(err));
}

describe("chatCompletion", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("returns content on 200 success", async () => {
    mockFetch(() => fakeResponse(200, { choices: [{ message: { content: "Paris" } }] }));
    expect(await chatCompletion(defaults)).toBe("Paris");
  });

  it("throws AiProviderError with status 429 on rate limit (no Retry-After)", async () => {
    mockFetch(() => fakeResponse(429, { error: { code: 429, message: "Rate limit exceeded" } }));
    try { await chatCompletion(defaults); } catch (error) {
      assertNoKeyLeak(error, "429");
      expect(error).toBeInstanceOf(AiProviderError);
      expect((error as AiProviderError).status).toBe(429);
    }
  });

  it("preserves Retry-After on 429", async () => {
    mockFetch(() =>
      fakeResponse(429, { error: { code: 429 } }, { "Retry-After": "2" }));
    try { await chatCompletion(defaults); } catch (error) {
      const e = error as AiProviderError;
      expect(e.status).toBe(429);
      expect(e.retryAfterSeconds).toBe(2);
    }
  });

  it("does NOT retry when Retry-After exceeds cap", async () => {
    const spy = mockFetch(() =>
      fakeResponse(429, { error: { code: 429 } }, { "Retry-After": "60" }));
    try { await chatCompletion(defaults); } catch (error) {
      expect((error as AiProviderError).retryAfterSeconds).toBe(60);
    }
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("retries on 500 and throws after exhaustion", async () => {
    mockFetch(() => fakeResponse(500, { error: { message: "Boom" } }));
    try { await chatCompletion(defaults); } catch (error) {
      assertNoKeyLeak(error, "500");
      expect((error as AiProviderError).status).toBe(500);
    }
  });

  it("retries empty completions (502 retryable) and throws after exhaustion", async () => {
    mockFetch(() => fakeResponse(200, { choices: [{ message: { content: "" } }] }));
    try { await chatCompletion(defaults); } catch (error) {
      assertNoKeyLeak(error, "empty");
      expect(error).toBeInstanceOf(AiProviderError);
      expect((error as AiProviderError).status).toBe(502);
    }
  });

  it("retries on network error (rejects with underlying error on exhaustion)", async () => {
    mockFetchReject(new Error("connection refused"));
    await expect(chatCompletion(defaults)).rejects.toThrow("connection refused");
  });

  it("converts DOMException to AiTimeoutError", async () => {
    mockFetchReject(new DOMException("aborted", "AbortError"));
    try { await chatCompletion(defaults); } catch (error) {
      assertNoKeyLeak(error, "timeout");
      expect(error).toBeInstanceOf(AiTimeoutError);
    }
  });

  it("handles non-JSON error bodies gracefully", async () => {
    mockFetch(() => new Response("Not JSON", { status: 503 }));
    try { await chatCompletion(defaults); } catch (error) {
      assertNoKeyLeak(error, "non-json");
      expect((error as AiProviderError).status).toBe(503);
    }
  });
});
