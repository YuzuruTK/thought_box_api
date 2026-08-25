/**
 * OpenRouter chat completions client.
 *
 * Implements cost/safety controls:
 * - configurable model via env (AI_MODEL)
 * - max_tokens limits per request
 * - 30s timeout via AbortSignal
 * - up to 2 retries with Retry-After-aware backoff on 429/5xx/network errors
 * - response shape validation
 * - rich error capture (provider metadata, Retry-After) without leaking keys
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const MAX_RETRY_AFTER_SECONDS = 8;

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterSeconds?: number,
    readonly providerCode?: number,
    readonly providerName?: string,
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

interface OpenRouterErrorBody {
  error?: {
    code?: number;
    message?: string;
    metadata?: Record<string, unknown>;
  };
}

interface OpenRouterSuccessBody {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

// ---- helpers ------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseRetryAfterSecs(headers: Headers): number | undefined {
  const raw = headers.get("Retry-After");
  if (raw === null) return undefined;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  return undefined;
}

function truncate(v: string, max: number): string {
  return v.length <= max ? v : `${v.slice(0, max)}…`;
}

async function attemptRequest(options: CompletionOptions): Promise<string> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
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
    let bodyText = "";
    let errorCode: number | undefined;
    let errorMessage: string | undefined;
    let errorMetadata: Record<string, unknown> | undefined;
    try {
      const body = (await response.json()) as OpenRouterErrorBody;
      errorCode = body.error?.code;
      errorMessage = body.error?.message;
      errorMetadata = body.error?.metadata;
      bodyText = JSON.stringify(body);
    } catch {
      try { bodyText = await response.text(); } catch { /* empty */ }
    }
    const retryAfter = parseRetryAfterSecs(response.headers);
    const providerName =
      typeof errorMetadata?.provider_name === "string"
        ? (errorMetadata.provider_name as string)
        : undefined;

    console.warn(
      `[openrouter] ${response.status} ${response.statusText} | model=${options.model}`,
      {
        status: response.status,
        statusText: response.statusText,
        model: options.model,
        errorCode,
        errorType: errorMetadata?.error_type,
        providerName,
        retryAfter,
        body: truncate(bodyText, 500),
      },
    );

    let clientMessage: string;
    if (response.status === 429) {
      clientMessage = "AI provider rate limit reached.";
    } else if (response.status === 401 || response.status === 403) {
      clientMessage = "AI provider rejected the configured credentials.";
    } else if (response.status === 402) {
      clientMessage = "AI provider account has insufficient credits.";
    } else {
      clientMessage = "AI provider returned an error.";
    }
    if (errorMessage && errorMessage !== "Rate limit exceeded") {
      clientMessage += ` (${errorMessage})`;
    }

    throw new AiProviderError(
      clientMessage,
      response.status,
      retryAfter,
      errorCode,
      providerName,
    );
  }

  const body = (await response.json()) as OpenRouterSuccessBody;
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new AiProviderError("OpenRouter returned an empty completion.", 502);
  }
  return content;
}

/**
 * Call OpenRouter chat completions with retries and timeout handling.
 */
export async function chatCompletion(options: CompletionOptions): Promise<string> {
  let lastError: Error = new AiProviderError("Request never attempted.");
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await attemptRequest(options);
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        lastError = new AiTimeoutError();
      } else {
        lastError = error instanceof Error ? error : new AiProviderError(String(error));
      }

      const retryable =
        (lastError instanceof AiProviderError &&
          lastError.status !== undefined &&
          isRetryableStatus(lastError.status)) ||
        lastError instanceof AiTimeoutError ||
        (!(lastError instanceof AiProviderError) &&
          !(lastError instanceof AiTimeoutError));

      if (!retryable || attempt === MAX_RETRIES) break;

      const waitSecs =
        lastError instanceof AiProviderError &&
        lastError.retryAfterSeconds !== undefined
          ? lastError.retryAfterSeconds
          : undefined;
      if (waitSecs !== undefined) {
        if (waitSecs <= MAX_RETRY_AFTER_SECONDS) {
          await sleep(waitSecs * 1_000);
        } else {
          break;
        }
      } else {
        await sleep(2 ** attempt * 500);
      }
    }
  }
  throw lastError;
}
