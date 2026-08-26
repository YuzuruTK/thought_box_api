import type { Env } from "../../env";
import { getDb, type Database } from "../../db";
import { BoxService } from "../boxService";
import { ThoughtService } from "../thoughtService";
import { DocumentService } from "../documentService";
import { ValidationError, CooldownError } from "../errors";
import { AiProviderError, AiTimeoutError } from "./openrouter";
import { ProviderResolver, createResolverDeps } from "./providerResolver";
import { buildSynthesisPrompt } from "./prompts";

/** Token limit for the single blended (resume + document) request. */
const SYNTHESIS_MAX_TOKENS = 1_000;

/** Minimum time between manual syntheses (minutes). */
const SYNTHESIS_COOLDOWN_MS = 30 * 60 * 1_000;

/** Maximum number of thoughts sent to the model per generation. */
const MAX_THOUGHTS_PER_PROMPT = 200;

/**
 * Split a blended model response into the resume (plain text before the
 * first markdown H1) and the document (from the first "# heading" onwards).
 */
interface SynthesisParts {
  resume: string;
  document: string;
  documentTitle: string;
}

function splitSynthesisContent(content: string): SynthesisParts {
  const h1Index = content.search(/^#\s+/m);
  if (h1Index === -1) {
    // No document heading found - treat everything as the document so we
    // never lose content; resume is left empty.
    return { resume: "", document: content.trim(), documentTitle: "Project Summary" };
  }
  const resume = content.slice(0, h1Index).trim();
  const document = content.slice(h1Index).trim();
  const titleMatch = document.match(/^#\s+(.+)$/m);
  return {
    resume,
    document,
    documentTitle: titleMatch?.[1]?.trim() ?? "Project Summary",
  };
}

/**
 * AI generator - orchestrates thought loading, prompt building, the
 * OpenRouter call, response validation, and cache persistence.
 */
export class AiGenerator {
  private readonly db: Database;
  private readonly boxes: BoxService;
  private readonly thoughts: ThoughtService;
  private readonly documents: DocumentService;

  private readonly resolver: ProviderResolver;

  constructor(private readonly env: Env) {
    this.db = getDb(env);
    this.boxes = new BoxService(this.db);
    this.thoughts = new ThoughtService(this.db);
    this.documents = new DocumentService(this.db);
    this.resolver = new ProviderResolver(createResolverDeps(env));
  }

  /**
   * Synthesize (or re-synthesize) a box: one request produces both the brief
   * resume (stored as `summary`) and the structured document.
   * Manual calls are rate-limited by SYNTHESIS_COOLDOWN_MS.
   */
  async synthesize(userId: number, boxId: number): Promise<void> {
    // Manual cooldown against the most recent regeneration of any kind
    // (summary and document rows are always written together).
    const last = await this.documents.findLatestForBox(boxId);
    if (last) {
      const elapsed = Date.now() - last.updatedAt.getTime();
      if (elapsed < SYNTHESIS_COOLDOWN_MS) {
        const minutes = Math.ceil((SYNTHESIS_COOLDOWN_MS - elapsed) / 60_000);
        throw new CooldownError(
          `The document can be synthesized once every 30 minutes. Try again in ${minutes} min.`,
        );
      }
    }

    const { box, thoughtContents } = await this.loadBoxContext(userId, boxId);

    const prompt = buildSynthesisPrompt({
      boxName: box.name,
      boxDescription: box.description,
      thoughts: thoughtContents,
    });

    const { result, kind } = await this.callModel(userId, prompt, SYNTHESIS_MAX_TOKENS);
    const { resume, document, documentTitle } = splitSynthesisContent(result.content);

    // Persist both the resume and the document from the single request.
    await this.documents.upsert(userId, boxId, "summary", `${box.name} — Summary`, resume, result.model, kind);
    await this.documents.upsert(userId, boxId, "document", documentTitle, document, result.model, kind);
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

  private async callModel(
    userId: number,
    prompt: string,
    maxTokens: number,
  ): Promise<{ result: { content: string; model: string }; kind: string }> {
    try {
      const { result, kind } = await this.resolver.complete(userId, {
        prompt,
        maxTokens,
      });
      const content = validateMarkdown(result.content);
      return { result: { content, model: result.model }, kind };
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
    throw new AiProviderError("AI returned empty content.", 502);
  }
  return content;
}
