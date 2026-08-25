/**
 * OpenRouter chat completions client.
 *
 * Implements cost/safety controls:
 * - configurable model via env (AI_MODEL)
 * - max_tokens limits per request
 * - 30s timeout via AbortSignal
 * - up to 2 retries with exponential backoff on 429/5xx/network errors
 * - response shape validation
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export class AiTimeoutError extends Error {
  constructor() {
    super("AI request timed out.");
    this.name = "AiTimeoutError";
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: { message?: string };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function attemptRequest(options: CompletionOptions): Promise<string> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://thought-box-api",
      "X-Title": "Thought Box",
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 0.3,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new AiProviderError(
      `OpenRouter returned ${response.status}.`,
      response.status,
    );
  }

  const body = (await response.json()) as OpenRouterResponse;
  if (body.error?.message) {
    throw new AiProviderError(`OpenRouter error: ${body.error.message}`);
  }

  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    // Status 502 marks this as a retryable provider failure.
    throw new AiProviderError("OpenRouter returned an empty completion.", 502);
  }
  return content;
}

/**
 * Call OpenRouter chat completions with retries and timeout handling.
 *
 * @param options - Model, messages, token limit, and credentials.
 * @returns The assistant's message content.
 * @throws AiTimeoutError when all attempts time out.
 * @throws AiProviderError on non-retryable failures or exhausted retries.
 */
export async function chatCompletion(options: CompletionOptions): Promise<string> {
  let lastError: Error = new AiProviderError("Request never attempted.");
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await attemptRequest(options);
    } catch (error) {
      lastError = error instanceof Error ? error : new AiProviderError(String(error));
      const retryable =
        (error instanceof AiProviderError && error.status !== undefined && isRetryableStatus(error.status)) ||
        error instanceof AiTimeoutError ||
        !(error instanceof AiProviderError); // network errors
      if (!retryable || attempt === MAX_RETRIES) {
        break;
      }
      await sleep(2 ** attempt * 500); // 500ms, 1s
    }
  }
  throw lastError;
}