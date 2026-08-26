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

/**
 * AiProvider — the abstraction over any AI backend.
 *
 * Implementations must never leak API keys: they return only the generated
 * content and model. Failures are raised as AiProviderError / AiTimeoutError.
 */
export interface AiProvider {
  /** Stable identifier for provenance metadata ('platform' | 'byok' | ...). */
  readonly kind: AiProviderKind;
  /** Human/UI-facing provider name. */
  readonly name: string;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

/**
 * PlatformGeminiProvider — runs generations directly against Google's Gemini
 * API using the platform's Gemini API key.
 */
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
 * PlatformOpenRouterProvider — retained for compatibility with deployments
 * that instantiate the provider directly. The default resolver now uses
 * PlatformGeminiProvider.
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

/**
 * UserOpenRouterProvider — runs generations on a user's own OpenRouter key.
 * This remains supported as the existing BYOK path.
 */
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

/**
 * WorkersAIProvider — a stub so the provider seam exists. Not implemented in
 * Issue #1. Throws if selected.
 */
export class WorkersAIProvider implements AiProvider {
  readonly kind: AiProviderKind = "workers-ai";
  readonly name = "Workers AI";

  async complete(_request: CompletionRequest): Promise<CompletionResult> {
    throw new AiProviderError("WorkersAIProvider is not implemented yet.", 501);
  }
}
