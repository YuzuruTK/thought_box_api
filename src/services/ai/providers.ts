import { geminiCompletion } from "./gemini";
import { chatCompletion, AiProviderError } from "./openrouter";

export type AiProviderKind = "platform" | "byok" | "workers-ai";

/** A single model completion request. */
export interface CompletionRequest {
  prompt: string;
  maxTokens: number;
  modelOverride?: string;
}

/** The model's raw text output (sanitized — no keys). */
export interface CompletionResult {
  content: string;
  model: string;
}

export interface AiProvider {
  readonly kind: AiProviderKind;
  readonly name: string;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

/** Direct Gemini provider retained as the platform standby provider. */
export class PlatformGeminiProvider implements AiProvider {
  readonly kind: AiProviderKind = "platform";
  readonly name = "Google Gemini (platform key)";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const model = request.modelOverride ?? this.model;
    const content = await geminiCompletion({
      apiKey: this.apiKey,
      model,
      prompt: request.prompt,
      maxTokens: request.maxTokens,
    });
    return { content, model };
  }
}

/**
 * Legacy platform OpenRouter provider retained for compatibility with older
 * direct consumers. It is no longer selected by the platform resolver.
 */
export class PlatformOpenRouterProvider implements AiProvider {
  readonly kind: AiProviderKind = "platform";
  readonly name = "Platform OpenRouter (shared key)";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const model = request.modelOverride ?? this.model;
    const content = await chatCompletion({
      apiKey: this.apiKey,
      model,
      messages: [{ role: "user", content: request.prompt }],
      maxTokens: request.maxTokens,
    });
    return { content, model };
  }
}

/** User-owned OpenRouter provider (BYOK). */
export class UserOpenRouterProvider implements AiProvider {
  readonly kind: AiProviderKind = "byok";
  readonly name = "Personal OpenRouter (your key)";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const model = request.modelOverride ?? this.model;
    const content = await chatCompletion({
      apiKey: this.apiKey,
      model,
      messages: [{ role: "user", content: request.prompt }],
      maxTokens: request.maxTokens,
    });
    return { content, model };
  }
}

export interface WorkersAiBinding {
  run(model: string, input: {
    messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }>;
    max_tokens?: number;
    temperature?: number;
  }): Promise<unknown>;
}

interface WorkersAiErrorLike {
  status?: unknown;
  code?: unknown;
  message?: unknown;
}

/**
 * Cloudflare Workers AI provider.
 *
 * Workers AI is the primary platform provider. The model is configurable so
 * it can be benchmarked/replaced without touching the generator layer.
 */
export class WorkersAIProvider implements AiProvider {
  readonly kind: AiProviderKind = "workers-ai";
  readonly name = "Cloudflare Workers AI";

  constructor(
    private readonly ai: WorkersAiBinding,
    private readonly model: string,
  ) {}

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const model = request.modelOverride ?? this.model;

    try {
      const raw = await this.ai.run(model, {
        messages: [{ role: "user", content: request.prompt }],
        max_tokens: request.maxTokens,
        temperature: 0.3,
      });

      const content = extractWorkersAiContent(raw);
      if (!content) {
        throw new AiProviderError(
          "Cloudflare Workers AI returned an empty completion.",
          502,
        );
      }

      return { content, model };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;

      const details = isWorkersAiError(error) ? error : undefined;
      const status = typeof details?.status === "number" ? details.status : undefined;
      const providerCode = typeof details?.code === "number" ? details.code : undefined;
      const message =
        typeof details?.message === "string"
          ? details.message
          : error instanceof Error
            ? error.message
            : "Unknown Cloudflare Workers AI error.";

      console.warn("[workers-ai] inference failed", {
        model,
        status,
        providerCode,
        message: message.slice(0, 500),
      });

      throw new AiProviderError(
        workersAiClientMessage(status, message),
        status,
        undefined,
        providerCode,
        "Cloudflare Workers AI",
      );
    }
  }
}

function isWorkersAiError(value: unknown): value is WorkersAiErrorLike {
  return typeof value === "object" && value !== null;
}

function workersAiClientMessage(status: number | undefined, message: string): string {
  if (status === 429) return "Cloudflare Workers AI rate limit reached.";
  if (status === 403) return "Cloudflare Workers AI access was denied.";
  if (status !== undefined && status >= 500) return "Cloudflare Workers AI returned a server error.";
  return message
    ? `Cloudflare Workers AI returned an error. (${message})`
    : "Cloudflare Workers AI returned an error.";
}

function extractWorkersAiContent(raw: unknown): string | null {
  if (typeof raw === "string") return raw.trim() || null;
  if (!raw || typeof raw !== "object") return null;

  const value = raw as {
    response?: unknown;
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  if (typeof value.response === "string") return value.response.trim() || null;
  const content = value.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() || null : null;
}
