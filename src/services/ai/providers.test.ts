import { describe, expect, it, vi } from "vitest";
import { AiProviderError } from "./openrouter";
import { WorkersAIProvider, type WorkersAiBinding } from "./providers";

function binding(run: WorkersAiBinding["run"]): WorkersAiBinding {
  return { run };
}

describe("WorkersAIProvider", () => {
  it("generates text through the configured Workers AI model", async () => {
    const run = vi.fn().mockResolvedValue({ response: "generated text" });
    const provider = new WorkersAIProvider(binding(run), "@cf/qwen/qwen3-30b-a3b-fp8");

    await expect(
      provider.complete({ prompt: "hello", maxTokens: 100 }),
    ).resolves.toEqual({
      content: "generated text",
      model: "@cf/qwen/qwen3-30b-a3b-fp8",
    });

    expect(run).toHaveBeenCalledWith("@cf/qwen/qwen3-30b-a3b-fp8", {
      messages: [{ role: "user", content: "hello" }],
      max_tokens: 100,
      temperature: 0.3,
    });
  });

  it("accepts OpenAI-compatible chat completion responses", async () => {
    const run = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "chat response" } }],
    });
    const provider = new WorkersAIProvider(binding(run), "model");

    await expect(
      provider.complete({ prompt: "hello", maxTokens: 20 }),
    ).resolves.toEqual({ content: "chat response", model: "model" });
  });

  it("rejects malformed or empty responses", async () => {
    const run = vi.fn().mockResolvedValue({ response: "   " });
    const provider = new WorkersAIProvider(binding(run), "model");

    await expect(
      provider.complete({ prompt: "hello", maxTokens: 20 }),
    ).rejects.toMatchObject({
      name: "AiProviderError",
      status: 502,
    });
  });

  it.each([403, 429, 503])("normalizes provider status %s", async (status) => {
    const run = vi.fn().mockRejectedValue({ status, code: 3040, message: "provider failure" });
    const provider = new WorkersAIProvider(binding(run), "model");

    await expect(
      provider.complete({ prompt: "hello", maxTokens: 20 }),
    ).rejects.toMatchObject({
      name: "AiProviderError",
      status,
      providerCode: 3040,
      providerName: "Cloudflare Workers AI",
    });
  });

  it("does not leak the raw provider object when an unknown error is thrown", async () => {
    const run = vi.fn().mockRejectedValue(new Error("boom"));
    const provider = new WorkersAIProvider(binding(run), "model");

    await expect(
      provider.complete({ prompt: "hello", maxTokens: 20 }),
    ).rejects.toBeInstanceOf(AiProviderError);
  });
});
