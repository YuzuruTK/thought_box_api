import { describe, expect, it, vi, afterEach } from "vitest";
import { geminiCompletion } from "./gemini";
import { AiProviderError } from "./openrouter";

describe("geminiCompletion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the Gemini Interactions API and extracts model output", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "completed",
          steps: [
            {
              type: "model_output",
              content: [{ type: "text", text: "Hello from Gemini" }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await geminiCompletion({
      apiKey: "gemini-test-key",
      model: "gemini-3.7-flash",
      prompt: "Say hello",
      maxTokens: 100,
    });

    expect(result).toBe("Hello from Gemini");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    );
    expect(init?.headers).toEqual({
      "Content-Type": "application/json",
      "x-goog-api-key": "gemini-test-key",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "gemini-3.7-flash",
      input: "Say hello",
      store: false,
      generation_config: {
        max_output_tokens: 100,
        temperature: 0.3,
      },
    });
  });

  it("normalizes Gemini rate-limit errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 429, message: "quota exceeded" } }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "9",
          },
        },
      ),
    );

    await expect(
      geminiCompletion({
        apiKey: "gemini-test-key",
        model: "gemini-3.7-flash",
        prompt: "Hello",
        maxTokens: 100,
      }),
    ).rejects.toMatchObject({
      name: "AiProviderError",
      status: 429,
      retryAfterSeconds: 9,
    } satisfies Partial<AiProviderError>);
  });

  it("does not leak the API key in provider errors", async () => {
    const secret = "gemini-super-secret-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 401, message: "invalid API key" } }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      geminiCompletion({
        apiKey: secret,
        model: "gemini-3.7-flash",
        prompt: "Hello",
        maxTokens: 100,
      }),
    ).rejects.toThrow("AI provider rejected the configured credentials");
  });
});
