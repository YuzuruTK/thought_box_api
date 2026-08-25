import type { Env } from "../../env";
import { getDb, type Database } from "../../db";
import { BoxService } from "../boxService";
import { ThoughtService } from "../thoughtService";
import { DocumentService } from "../documentService";
import { ValidationError, CooldownError } from "../errors";
import { AiProviderError, AiTimeoutError } from "./openrouter";
import { buildSynthesisPrompt } from "./prompts";
import { ProviderResolver } from "./providerResolver";

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

export class AiGenerator {
  private readonly db: Database;
  private readonly boxes: BoxService;
  private readonly thoughts: ThoughtService;
  private readonly documents: DocumentService;
  private readonly providers: ProviderResolver;

  constructor(private readonly env: Env) {
    this.db = getDb(env);
    this.boxes = new BoxService(this.db);
    this.thoughts = new ThoughtService(this.db);
    this.documents = new DocumentService(this.db);
    this.providers = new ProviderResolver(env);
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
    const prompt = buildSynthesisPrompt({ boxName: box.name, boxDescription: box.description, thoughts: thoughtContents });
    const provider = await this.providers.resolve(userId);
    const result = await this.callProvider(provider, userId, prompt, SYNTHESIS_MAX_TOKENS);
    const content = validateMarkdown(result.content);
    const { resume, document, documentTitle } = splitSynthesisContent(content);
    await this.documents.upsert(userId, boxId, "summary", `${box.name} — Summary`, resume, result.model, result.provider);
    await this.documents.upsert(userId, boxId, "document", documentTitle, document, result.model, result.provider);
  }

  private async loadBoxContext(userId: number, boxId: number) {
    const box = await this.boxes.getOwned(userId, boxId);
    const boxThoughts = await this.thoughts.listForBox(boxId);
    if (boxThoughts.length === 0) throw new ValidationError("Box has no thoughts to generate from.");
    const limited = boxThoughts.slice(0, MAX_THOUGHTS_PER_PROMPT);
    return { box, thoughtContents: limited.map((thought) => thought.content) };
  }

  private async callProvider(
    provider: Awaited<ReturnType<ProviderResolver["resolve"]>>,
    userId: number,
    prompt: string,
    maxTokens: number,
  ) {
    try {
      const result = await provider.complete({ prompt, maxTokens });
      return { ...result, provider: provider.kind };
    } catch (error) {
      if (provider.kind === "byok" && error instanceof AiProviderError && (error.status === 401 || error.status === 403)) {
        const fallback = await this.providers.fallbackToPlatform(userId);
        const result = await fallback.complete({ prompt, maxTokens });
        return { ...result, provider: fallback.kind };
      }
      if (error instanceof AiTimeoutError || error instanceof AiProviderError) throw error;
      throw new AiProviderError(error instanceof Error ? error.message : "Unknown AI provider error.");
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
