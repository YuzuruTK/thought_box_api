import type { Database } from "../../db";
import { aiUsage, type AiUsage } from "../../db/schema";

/**
 * A lightweight token estimator for providers that do not expose usage
 * metadata through the current client. Four UTF-8-ish characters per token is
 * intentionally conservative and is only suitable for analytics, not billing.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export type UsageStatus = "success" | "failed";

export interface RecordUsageInput {
  userId: number;
  generationType: "summary" | "document" | "synthesis";
  provider: string;
  model: string;
  status: UsageStatus;
  inputTokens?: number;
  outputTokens?: number;
  errorStatus?: number;
}

export class AiUsageService {
  constructor(private readonly db: Database) {}

  async record(input: RecordUsageInput): Promise<AiUsage> {
    const inputTokens = input.inputTokens ?? null;
    const outputTokens = input.outputTokens ?? null;
    const totalTokens =
      inputTokens !== null || outputTokens !== null
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : null;

    const [row] = await this.db
      .insert(aiUsage)
      .values({
        userId: input.userId,
        generationType: input.generationType,
        provider: input.provider,
        model: input.model,
        status: input.status,
        inputTokens,
        outputTokens,
        totalTokens,
        tokensEstimated: true,
        errorStatus: input.errorStatus,
      })
      .returning();

    if (!row) throw new Error("Failed to record AI usage.");
    return row;
  }
}
