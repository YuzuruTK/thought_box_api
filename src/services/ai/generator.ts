import type { Env } from "../../env";
import { getDb, type Database } from "../../db";
import { BoxService } from "../boxService";
import { ThoughtService } from "../thoughtService";
import { DocumentService } from "../documentService";
import { ValidationError } from "../errors";
import { chatCompletion, AiProviderError, AiTimeoutError } from "./openrouter";
import { buildSummaryPrompt, buildDocumentPrompt } from "./prompts";
import { CooldownError } from "../errors";
import type { GeneratedDocument } from "../../db/schema";

/** Token limits to control cost. */
const SUMMARY_MAX_TOKENS = 150;
const DOCUMENT_MAX_TOKENS = 1_000;

/** Minimum time between document syntheses. */
const DOCUMENT_COOLDOWN_MS = 60 * 60 * 1_000;

/** Maximum number of thoughts sent to the model per generation. */
const MAX_THOUGHTS_PER_PROMPT = 200;

export type GenerationType = "summary" | "document";

/**
 * AI generator — orchestrates thought loading, prompt building, the
 * OpenRouter call, response validation, and cache persistence.
 */
export class AiGenerator {
  private readonly db: Database;
  private readonly boxes: BoxService;
  private readonly thoughts: ThoughtService;
  private readonly documents: DocumentService;

  constructor(private readonly env: Env) {
    this.db = getDb(env);
    this.boxes = new BoxService(this.db);
    this.thoughts = new ThoughtService(this.db);
    this.documents = new DocumentService(this.db);
  }

  /**
   * Generate (or regenerate) the cached summary for a box.
   */
  async generateSummary(userId: number, boxId: number): Promise<GeneratedDocument> {
    const { box, thoughtContents } = await this.loadBoxContext(userId, boxId);

    const prompt = buildSummaryPrompt({
      boxName: box.name,
      boxDescription: box.description,
      thoughts: thoughtContents,
    });

    const content = await this.callModel(prompt, SUMMARY_MAX_TOKENS);
    const title = extractTitle(content) ?? `${box.name} — Summary`;

    return this.documents.upsert(userId, boxId, "summary", title, content, this.env.AI_MODEL);
  }

  /**
   * Synthesize (or re-synthesize) the cached document for a box.
   * Rate-limited to one synthesis per hour.
   */
  async generateDocument(userId: number, boxId: number): Promise<GeneratedDocument> {
    // Enforce the cooldown based on the cached document's timestamp.
    const cached = await this.documents.findCached(boxId, "document");
    if (cached) {
      const elapsed = Date.now() - cached.updatedAt.getTime();
      if (elapsed < DOCUMENT_COOLDOWN_MS) {
        const minutes = Math.ceil((DOCUMENT_COOLDOWN_MS - elapsed) / 60_000);
        throw new CooldownError(
          `The document can be synthesized once per hour. Try again in ${minutes} min.`,
        );
      }
    }

    const { box, thoughtContents } = await this.loadBoxContext(userId, boxId);

    const prompt = buildDocumentPrompt({
      boxName: box.name,
      boxDescription: box.description,
      thoughts: thoughtContents,
    });

    const content = await this.callModel(prompt, DOCUMENT_MAX_TOKENS);
    const title = extractTitle(content) ?? `${box.name} — Document`;

    return this.documents.upsert(userId, boxId, "document", title, content, this.env.AI_MODEL);
  }

  // ---- internals ----------------------------------------------------------

  private async loadBoxContext(userId: number, boxId: number) {
    const box = await this.boxes.getOwned(userId, boxId);

    const boxThoughts = await this.thoughts.listForBox(boxId);
    if (boxThoughts.length === 0) {
      throw new ValidationError("Box has no thoughts to generate from.");
    }

    // Cap the number of thoughts to control prompt size / cost.
    const limited = boxThoughts.slice(0, MAX_THOUGHTS_PER_PROMPT);
    return {
      box,
      thoughtContents: limited.map((thought) => thought.content),
    };
  }

  private async callModel(prompt: string, maxTokens: number): Promise<string> {
    try {
      const raw = await chatCompletion({
        apiKey: this.env.OPENROUTER_API_KEY,
        model: this.env.AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        maxTokens,
      });
      return validateMarkdown(raw);
    } catch (error) {
      if (error instanceof AiTimeoutError) {
        throw error;
      }
      if (error instanceof AiProviderError) {
        throw error;
      }
      throw new AiProviderError(
        error instanceof Error ? error.message : "Unknown AI provider error.",
      );
    }
  }
}

/**
 * Validate and clean the model's markdown output.
 * Strips surrounding code fences the model sometimes adds despite instructions.
 */
function validateMarkdown(raw: string): string {
  let content = raw.trim();
  const fenceMatch = content.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  if (fenceMatch?.[1]) {
    content = fenceMatch[1].trim();
  }
  if (content.length === 0) {
    throw new AiProviderError("AI returned empty content.");
  }
  return content;
}

/** Extract a document title from the first markdown heading, if any. */
function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}