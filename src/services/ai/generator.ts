import type { Env } from "../../env";
import { getDb, type Database } from "../../db";
import { BoxService } from "../boxService";
import { ThoughtService } from "../thoughtService";
import { DocumentService } from "../documentService";
import { ValidationError, CooldownError } from "../errors";
import { AiProviderError, AiTimeoutError } from "./openrouter";
import { ProviderResolver, createResolverDeps } from "./providerResolver";
import { buildSynthesisPrompt, detectPredominantLanguage } from "./prompts";
import { AiUsageService, estimateTokens } from "./usageService";

const SYNTHESIS_MAX_TOKENS = 1_000;
const SYNTHESIS_COOLDOWN_MS = 30 * 60 * 1_000;
const MAX_THOUGHTS_PER_PROMPT = 200;

interface SynthesisParts { resume: string; document: string; documentTitle: string; }

function splitSynthesisContent(content: string): SynthesisParts {
  const h1Index = content.search(/^#\s+/m);
  if (h1Index === -1) return { resume: "", document: content.trim(), documentTitle: "Project Summary" };
  const resume = content.slice(0, h1Index).trim();
  const document = content.slice(h1Index).trim();
  const titleMatch = document.match(/^#\s+(.+)$/m);
  return { resume, document, documentTitle: titleMatch?.[1]?.trim() ?? "Project Summary" };
}

/** AI generator with provider provenance and usage analytics. */
export class AiGenerator {
  private readonly db: Database;
  private readonly boxes: BoxService;
  private readonly thoughts: ThoughtService;
  private readonly documents: DocumentService;
  private readonly usage: AiUsageService;
  private readonly resolver: ProviderResolver;

  constructor(private readonly env: Env) {
    this.db = getDb(env);
    this.boxes = new BoxService(this.db);
    this.thoughts = new ThoughtService(this.db);
    this.documents = new DocumentService(this.db);
    this.usage = new AiUsageService(this.db);
    this.resolver = new ProviderResolver(createResolverDeps(env));
  }

  async synthesize(userId: number, boxId: number): Promise<void> {
    const last = await this.documents.findLatestForBox(boxId);
    if (last) {
      const elapsed = Date.now() - last.updatedAt.getTime();
      if (elapsed < SYNTHESIS_COOLDOWN_MS) {
        const minutes = Math.ceil((SYNTHESIS_COOLDOWN_MS - elapsed) / 60_000);
        throw new CooldownError(`The document can be synthesized once every 30 minutes. Try again in ${minutes} min.`);
      }
    }

    const { box, thoughtContents } = await this.loadBoxContext(userId, boxId);
    const language = detectPredominantLanguage(thoughtContents);
    const prompt = buildSynthesisPrompt({ boxName: box.name, boxDescription: box.description, thoughts: thoughtContents, language });

    let result: { content: string; model: string };
    let kind: string;
    try {
      ({ result, kind } = await this.callModel(userId, prompt, SYNTHESIS_MAX_TOKENS));
    } catch (error) {
      await this.recordFailure(userId, prompt, error);
      throw error;
    }

    const { resume, document, documentTitle } = splitSynthesisContent(result.content);
    await this.documents.upsert(userId, boxId, "summary", `${box.name} — Summary`, resume, result.model, kind);
    await this.documents.upsert(userId, boxId, "document", documentTitle, document, result.model, kind);
    await this.recordSuccess(userId, prompt, result.content, result.model, kind, resume, document);
  }

  private async loadBoxContext(userId: number, boxId: number) {
    const box = await this.boxes.getOwned(userId, boxId);
    const boxThoughts = await this.thoughts.listForBox(boxId);
    if (boxThoughts.length === 0) throw new ValidationError("Box has no thoughts to generate from.");
    const limited = boxThoughts.slice(0, MAX_THOUGHTS_PER_PROMPT);
    return { box, thoughtContents: limited.map((thought) => thought.content) };
  }

  private async callModel(userId: number, prompt: string, maxTokens: number): Promise<{ result: { content: string; model: string }; kind: string }> {
    try {
      const { result, kind } = await this.resolver.complete(userId, { prompt, maxTokens });
      return { result: { content: validateMarkdown(result.content), model: result.model }, kind };
    } catch (error) {
      if (error instanceof AiTimeoutError || error instanceof AiProviderError) throw error;
      throw new AiProviderError(error instanceof Error ? error.message : "Unknown AI provider error.");
    }
  }

  private async recordSuccess(userId: number, prompt: string, content: string, model: string, provider: string, resume: string, document: string): Promise<void> {
    const inputTotal = estimateTokens(prompt);
    const outputTotal = estimateTokens(content);
    const outputLength = resume.length + document.length;
    const summaryShare = outputLength > 0 ? resume.length / outputLength : 0;
    const summaryOutput = Math.round(outputTotal * summaryShare);
    const documentOutput = outputTotal - summaryOutput;
    const summaryInput = Math.round(inputTotal * summaryShare);
    const documentInput = inputTotal - summaryInput;

    await this.recordBestEffort({ userId, generationType: "summary", provider, model, status: "success", inputTokens: summaryInput, outputTokens: summaryOutput });
    await this.recordBestEffort({ userId, generationType: "document", provider, model, status: "success", inputTokens: documentInput, outputTokens: documentOutput });
  }

  private async recordFailure(userId: number, prompt: string, error: unknown): Promise<void> {
    const provider = error instanceof AiProviderError || error instanceof AiTimeoutError ? error.providerKind ?? "unknown" : "unknown";
    const errorStatus = error instanceof AiProviderError ? error.status : undefined;
    const model = provider === "byok"
      ? this.env.OPENROUTER_MODEL ?? "openrouter/free"
      : this.env.GEMINI_MODEL;

    await this.recordBestEffort({
      userId,
      generationType: "synthesis",
      provider,
      model,
      status: "failed",
      inputTokens: estimateTokens(prompt),
      outputTokens: 0,
      errorStatus,
    });
  }

  private async recordBestEffort(input: Parameters<AiUsageService["record"]>[0]): Promise<void> {
    try {
      await this.usage.record(input);
    } catch (error) {
      console.error("[analytics] failed to record AI usage", error);
    }
  }
}

function validateMarkdown(raw: string): string {
  let content = raw.trim();
  const fenceMatch = content.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  if (fenceMatch?.[1]) content = fenceMatch[1].trim();
  if (content.length === 0) throw new AiProviderError("AI returned empty content.", 502);
  return content;
}
