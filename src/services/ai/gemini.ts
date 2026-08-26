/**
 * Direct Google Gemini API client.
 *
 * Uses the Gemini Interactions API, Google's recommended interface for new
 * Gemini integrations. The API key is sent directly to Google and never
 * leaves the Worker for a third-party model router.
 *
 * Implements the same provider error/timeout contract as OpenRouter:
 * - 30s timeout
 * - up to 2 retries on 429/5xx/network errors
 * - Retry-After-aware backoff
 * - normalized AiProviderError / AiTimeoutError
 */

import { AiProviderError, AiTimeoutError } from "./openrouter";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const MAX_RETRY_AFTER_SECONDS = 8;

interface GeminiErrorBody {
  error?: {
    code?: number | string;
    message?: string;
    status?: string;
  };
}

interface GeminiSuccessBody {
  status?: string;
  steps?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseRetryAfterSecs(headers: Headers): number | undefined {
  const raw = headers.get("Retry-After");
  if (raw === null) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

async function attemptRequest(
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      input: prompt,
      store: false,
      generation_config: {
        max_output_tokens: maxTokens,
        temperature: 0.3,
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    let bodyText = "";
    let errorCode: number | undefined;
    let errorMessage: string | undefined;

    try {
      const body = (await response.json()) as GeminiErrorBody;
      errorMessage = body.error?.message;
      if (typeof body.error?.code === "number") {
        errorCode = body.error.code;
      }
      bodyText = JSON.stringify(body);
    } catch {
      try {
        bodyText = await response.text();
      } catch {
        // Keep the diagnostic body empty.
      }
    }

    const retryAfter = parseRetryAfterSecs(response.headers);

    console.warn(
      `[gemini] ${response.status} ${response.statusText} | model=${model}`,
      {
        status: response.status,
        statusText: response.statusText,
        model,
        errorCode,
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

    if (errorMessage) {
      clientMessage += ` (${errorMessage})`;
    }

    throw new AiProviderError(
      clientMessage,
      response.status,
      retryAfter,
      errorCode,
      "Google Gemini",
    );
  }

  const body = (await response.json()) as GeminiSuccessBody;
  const modelOutputs = (body.steps ?? [])
    .filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((content) => content.type === "text" && typeof content.text === "string")
    .map((content) => content.text as string);

  const content = modelOutputs.join("").trim();
  if (!content) {
    throw new AiProviderError("Gemini returned an empty completion.", 502);
  }

  if (body.status && body.status !== "completed" && body.status !== "incomplete") {
    throw new AiProviderError(`Gemini interaction ended with status: ${body.status}.`, 502);
  }

  return content;
}

/**
 * Call Google's Gemini Interactions API with retries and timeout handling.
 */
export async function geminiCompletion(options: {
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens: number;
}): Promise<string> {
  let lastError: Error = new AiProviderError("Request never attempted.");

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await attemptRequest(
        options.apiKey,
        options.model,
        options.prompt,
        options.maxTokens,
      );
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        lastError = new AiTimeoutError();
      } else {
        lastError = error instanceof Error
          ? error
          : new AiProviderError(String(error));
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
        lastError instanceof AiProviderError
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
