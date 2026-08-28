/**
 * Parsing and validation of the structured synthesis metadata block that the
 * AI appends to every synthesis response, delimited by explicit markers:
 *
 *   <<<THOUGHT_BOX_METADATA>>>
 *   {"coreTheme": "...", "confidence": 0.82, "questions": ["...", ...]}
 *   <<<END_THOUGHT_BOX_METADATA>>>
 *
 * Extraction relies ONLY on the explicit delimiters — raw JSON elsewhere in
 * the response is ignored. Parsing is best-effort and never throws: any
 * failure yields `null` metadata so summary/document generation keeps working.
 */

export const METADATA_START_MARKER = "<<<THOUGHT_BOX_METADATA>>>";
export const METADATA_END_MARKER = "<<<END_THOUGHT_BOX_METADATA>>>";

/** Maximum number of questions kept (bounds storage; the prompt requests 5). */
const MAX_QUESTIONS = 10;

/**
 * Qualitative → numeric mapping for providers that ignore the numeric
 * confidence contract and answer with a level instead.
 */
const CONFIDENCE_LABELS: Record<string, number> = { low: 0.3, medium: 0.6, high: 0.85 };

export interface SynthesisMetadata {
  /** Dominant theme, or null when none could be confidently identified. */
  coreTheme: string | null;
  /** Heuristic estimate in [0, 1] — NOT a calibrated measurement. */
  confidence: number | null;
  /** One or more non-empty reflection questions (the prompt requests 5). */
  questions: string[];
}

export interface ParsedSynthesis {
  /** Response content with the metadata block removed. */
  content: string;
  metadata: SynthesisMetadata | null;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parseConfidence(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return clamp01(value);
  if (typeof value === "string") {
    const mapped = CONFIDENCE_LABELS[value.trim().toLowerCase()];
    if (mapped !== undefined) return mapped;
  }
  return null;
}

function parseCoreTheme(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseQuestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .map((q) => q.trim())
    .slice(0, MAX_QUESTIONS);
}

/**
 * Field-by-field sanitization. A payload is only considered valid when at
 * least one field carries usable information; otherwise metadata is null.
 */
function sanitizeMetadata(raw: unknown): SynthesisMetadata | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const coreTheme = parseCoreTheme(record.coreTheme);
  const confidence = parseConfidence(record.confidence);
  const questions = parseQuestions(record.questions);
  if (coreTheme === null && confidence === null && questions.length === 0) return null;
  return { coreTheme, confidence, questions };
}

/** Extract the delimited metadata block and sanitize its contents. */
export function parseSynthesisMetadata(content: string): ParsedSynthesis {
  const startIndex = content.indexOf(METADATA_START_MARKER);
  if (startIndex === -1) return { content: content.trim(), metadata: null };

  const before = content.slice(0, startIndex);
  const afterStart = content.slice(startIndex + METADATA_START_MARKER.length);
  const endIndex = afterStart.indexOf(METADATA_END_MARKER);
  const jsonText = (endIndex === -1 ? afterStart : afterStart.slice(0, endIndex)).trim();

  // Tolerate markdown fences the model may wrap the JSON in.
  const unwrapped = jsonText
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  let metadata: SynthesisMetadata | null = null;
  try {
    metadata = sanitizeMetadata(JSON.parse(unwrapped));
  } catch {
    metadata = null;
  }

  return { content: before.trim(), metadata };
}