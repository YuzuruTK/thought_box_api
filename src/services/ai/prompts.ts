/**
 * Prompt templates for AI generation.
 *
 * Safety rules are embedded in every prompt: the model must never invent
 * requirements, facts, or technical decisions. Missing information must be
 * explicitly flagged as "Insufficient information available."
 */

const SAFETY_RULES = `
SAFETY RULES (must follow strictly):
- Never invent project requirements, facts, or technical decisions that are not present in the thoughts.
- Never fabricate information.
- If information is missing or unclear for a section, write exactly: "Insufficient information available."
- Base every statement only on the provided thoughts.`;

export type SynthesisLanguage = "pt-BR" | "en" | "es";

const LANGUAGE_LABELS: Record<SynthesisLanguage, string> = {
  "pt-BR": "Brazilian Portuguese (pt-BR)",
  en: "English (en)",
  es: "Spanish (es)",
};

const LANGUAGE_WORDS: Record<SynthesisLanguage, string[]> = {
  "pt-BR": ["não", "você", "para", "uma", "que", "com", "dos", "das", "está", "são", "como", "por", "sobre", "projeto", "pensamento", "ideia", "preciso", "quero", "também", "isso"],
  en: ["the", "and", "is", "to", "of", "in", "for", "with", "this", "that", "are", "from", "about", "project", "thought", "idea", "need", "want", "also", "it"],
  es: ["el", "la", "los", "las", "que", "para", "una", "con", "está", "son", "como", "por", "sobre", "proyecto", "pensamiento", "idea", "necesito", "quiero", "también", "esto"],
};

/**
 * Detect the predominant language without making another AI call.
 * Scores are based on language-specific words, so a previous synthesis or the
 * model's default language cannot influence the result.
 */
export function detectPredominantLanguage(thoughts: string[]): SynthesisLanguage {
  const scores: Record<SynthesisLanguage, number> = { "pt-BR": 0, en: 0, es: 0 };
  const meaningfulText = thoughts.join(" ").toLocaleLowerCase("pt-BR").normalize("NFC");
  const words = meaningfulText.match(/[\p{L}]+/gu) ?? [];

  for (const word of words) {
    for (const language of Object.keys(LANGUAGE_WORDS) as SynthesisLanguage[]) {
      if (LANGUAGE_WORDS[language].includes(word)) scores[language] += 1;
    }
  }

  const ordered = (Object.keys(scores) as SynthesisLanguage[]).sort((a, b) => scores[b] - scores[a]);
  return ordered[0] ?? "pt-BR";
}

export interface PromptContext {
  boxName: string;
  boxDescription?: string | null;
  thoughts: string[];
  language?: SynthesisLanguage;
}

function formatThoughts(thoughts: string[]): string {
  return thoughts.map((thought, index) => `${index + 1}. ${thought}`).join("\n");
}

function formatBoxHeader(context: PromptContext): string {
  const description = context.boxDescription
    ? `\nBox description: ${context.boxDescription}`
    : "";
  return `Box name: ${context.boxName}${description}`;
}

/**
 * Build ONE prompt that produces two things in a single response:
 *  1. a brief plain-text resume of the box (1–2 sentences), and
 *  2. a structured markdown document (# Project Summary) beneath it.
 */
export function buildSynthesisPrompt(context: PromptContext): string {
  const language = context.language ?? detectPredominantLanguage(context.thoughts);
  const languageLabel = LANGUAGE_LABELS[language];

  return `You are an assistant that distills and then synthesizes collections of short notes ("thoughts") into a project summary.

${formatBoxHeader(context)}

Thoughts:
${formatThoughts(context.thoughts)}

LANGUAGE REQUIREMENT (must follow strictly):
- The application has determined the required output language: ${languageLabel}.
- Write BOTH the resume and the structured document entirely in ${languageLabel}.
- This language is authoritative. Do not infer a different output language from the box name, instructions, model defaults, or any previously generated document.
- Do not translate the thoughts into another language.
- If the thoughts contain multiple languages, the application-selected language is the language of the majority of the meaningful content.

PART 1 — DISTILL (a very brief resume):
- Identify what this collection of thoughts is about at its core.
- Write ONE OR TWO short sentences that capture that essence.
- Use only the information present in the thoughts.

PART 2 — SYNTHESIZE (a structured document):
- Identify the main themes across the thoughts and how they connect.
- Merge duplicate or overlapping thoughts.
- Preserve important details; do not lose information.
- Produce a concise, structured, easy-to-read summary in markdown with exactly these sections:
  # Project Summary

  ## Overview

  ## Main Ideas

  ## Important Concepts

  ## Open Questions

OUTPUT FORMAT (strict):
1. Start with the resume (Part 1) as PLAIN TEXT. No markdown, no headings, no bullets, no numbering.
   - Do not mention the instructions, the notes list, the box name, or how you wrote this.
   - Do not reuse the words "thoughts", "resume", "sentence" or "summarize".
   - Write directly about the topic as if describing it to another person.
2. Then a blank line, then the structured document (Part 2) starting with the "# Project Summary" heading.

${SAFETY_RULES}

Respond with the resume, then the document. Do not wrap in code fences, do not add text before or after.`;
}
