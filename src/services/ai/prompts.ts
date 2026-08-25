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

export interface PromptContext {
  boxName: string;
  boxDescription?: string | null;
  thoughts: string[];
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
  return `You are an assistant that distills and then synthesizes collections of short notes ("thoughts") into a project summary.

${formatBoxHeader(context)}

Thoughts:
${formatThoughts(context.thoughts)}

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