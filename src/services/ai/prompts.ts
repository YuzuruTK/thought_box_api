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
  /** Latest cached summary, used as context for document generation. */
  summary?: string | null;
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
 * Prompt for generating a concise, structured markdown project summary.
 */
export function buildSummaryPrompt(context: PromptContext): string {
  return `You are an assistant that summarizes collections of short notes ("thoughts") into a concise project summary.

${formatBoxHeader(context)}

Thoughts:
${formatThoughts(context.thoughts)}

TASK:
- Identify the main themes across the thoughts.
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

/**
 * Prompt for generating a complete, professional structured document
 * (e.g. Game Design Document, Research Summary, Product Specification,
 * Technical Architecture, or Story Outline) from the thoughts.
 */
export function buildDocumentPrompt(context: PromptContext): string {
  const summarySection = context.summary
    ? `\nLatest project summary (use as context, but the thoughts are the source of truth):\n${context.summary}\n`
    : "";

  return `You are a professional technical writer that transforms collections of short notes ("thoughts") into a complete, well-structured document.

${formatBoxHeader(context)}
${summarySection}
Thoughts:
${formatThoughts(context.thoughts)}

TASK:
- Infer the most appropriate document type from the content (e.g. Game Design Document, Research Summary, Product Specification, Technical Architecture, Story Outline).
- Organize the thoughts into logical sections with clear headings.
- Remove duplicates.
- Expand fragmented ideas into complete, coherent paragraphs — but only using information present in the thoughts.
- Maintain consistency in tone and terminology throughout.
- The result should read like a professional specification.

OUTPUT FORMAT:
- Start with a top-level title (# ...) that names the document.
- Follow with logical sections (## ...) appropriate for the inferred document type.
- Use markdown throughout.

${SAFETY_RULES}

Respond with the markdown document only. Do not wrap it in code fences.`;
}