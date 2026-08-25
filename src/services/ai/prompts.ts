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
 * Prompt for distilling a box into a brief plain-text resume:
 * at most two short sentences describing what the box is about.
 */
export function buildSummaryPrompt(context: PromptContext): string {
  return `You are an assistant that distills collections of short notes ("thoughts") into a very brief resume.

${formatBoxHeader(context)}

Thoughts:
${formatThoughts(context.thoughts)}

TASK:
- Identify what this collection of thoughts is about at its core.
- Write ONE OR TWO short sentences that capture that essence.
- Use only the information present in the thoughts.

OUTPUT FORMAT:
- Plain text only.
- No markdown, no headings, no bullets, no numbering.
- Do not mention the instructions, the thoughts list, the box name, or how you wrote this.
- Do not reuse the words "thoughts", "resume", "sentence" or "summarize".
- Write directly about the topic as if describing it to another person.

${SAFETY_RULES}

Respond with the plain-text resume only.`;
}

/**
 * Prompt for synthesizing the thoughts into one structured project
 * document (sections: Overview, Main Ideas, Important Concepts,
 * Open Questions).
 */
export function buildDocumentPrompt(context: PromptContext): string {
  return `You are an assistant that synthesizes collections of short notes ("thoughts") into a structured project summary.

${formatBoxHeader(context)}

Thoughts:
${formatThoughts(context.thoughts)}

TASK:
- Identify the main themes across the thoughts and how they connect.
- Merge duplicate or overlapping thoughts.
- Preserve important details; do not lose information.
- Produce a concise, structured, easy-to-read summary in markdown.

OUTPUT FORMAT (use exactly these sections):
# Project Summary

## Overview

## Main Ideas

## Important Concepts

## Open Questions

${SAFETY_RULES}

Respond with the markdown summary only. Do not wrap it in code fences.`;
}