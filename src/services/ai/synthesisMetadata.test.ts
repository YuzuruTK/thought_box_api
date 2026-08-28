import { describe, expect, it } from "vitest";
import {
  METADATA_END_MARKER,
  METADATA_START_MARKER,
  parseSynthesisMetadata,
} from "./synthesisMetadata";

function wrap(json: string): string {
  return `${METADATA_START_MARKER}\n${json}\n${METADATA_END_MARKER}`;
}

describe("parseSynthesisMetadata — extraction", () => {
  it("extracts and sanitizes a valid metadata block", () => {
    const content = `Resume text here.\n\n# Project Summary\n\n## Overview\n\nBody.\n\n${wrap(
      '{"coreTheme": "Cloudflare Workers", "confidence": 0.82, "questions": ["Q1", "Q2", "Q3", "Q4", "Q5"]}',
    )}`;

    const { content: stripped, metadata } = parseSynthesisMetadata(content);

    expect(metadata).toEqual({
      coreTheme: "Cloudflare Workers",
      confidence: 0.82,
      questions: ["Q1", "Q2", "Q3", "Q4", "Q5"],
    });
    // The block must be stripped from the persisted content.
    expect(stripped).not.toContain(METADATA_START_MARKER);
    expect(stripped).toContain("# Project Summary");
    expect(stripped.startsWith("Resume text here.")).toBe(true);
  });

  it("tolerates whitespace and markdown fences inside the block", () => {
    const content = `Doc\n\n${METADATA_START_MARKER}\n\`\`\`json\n{"coreTheme": "T", "confidence": 0.5, "questions": ["Q"]}\n\`\`\`\n${METADATA_END_MARKER}`;
    const { metadata } = parseSynthesisMetadata(content);
    expect(metadata).toEqual({ coreTheme: "T", confidence: 0.5, questions: ["Q"] });
  });

  it("ignores JSON that appears outside the delimiters", () => {
    const content = '{"coreTheme": "evil", "confidence": 1, "questions": ["nope"]}\n\nPlain text.';
    const { content: stripped, metadata } = parseSynthesisMetadata(content);
    expect(metadata).toBeNull();
    expect(stripped).toContain("Plain text.");
  });

  it("returns null metadata when there is no start marker", () => {
    const { content, metadata } = parseSynthesisMetadata("# Project Summary\n\nBody.");
    expect(metadata).toBeNull();
    expect(content).toBe("# Project Summary\n\nBody.");
  });
});

describe("parseSynthesisMetadata — theme", () => {
  it("accepts coreTheme null (no dominant theme)", () => {
    const { metadata } = parseSynthesisMetadata(
      wrap('{"coreTheme": null, "confidence": 0.2, "questions": ["Q1", "Q2"]}'),
    );
    expect(metadata).toEqual({ coreTheme: null, confidence: 0.2, questions: ["Q1", "Q2"] });
  });

  it("accepts a missing coreTheme key", () => {
    const { metadata } = parseSynthesisMetadata(wrap('{"confidence": 0.9, "questions": ["Q"]}'));
    expect(metadata).toEqual({ coreTheme: null, confidence: 0.9, questions: ["Q"] });
  });

  it("treats a blank coreTheme string as null", () => {
    const { metadata } = parseSynthesisMetadata(wrap('{"coreTheme": "  ", "confidence": 0.9, "questions": ["Q"]}'));
    expect(metadata?.coreTheme).toBeNull();
  });
});

describe("parseSynthesisMetadata — confidence", () => {
  it.each([
    [1.7, 1],
    [-0.2, 0],
    [0.82, 0.82],
  ])("clamps %p to %p", (input, expected) => {
    const { metadata } = parseSynthesisMetadata(
      wrap(`{"coreTheme": "T", "confidence": ${input}, "questions": ["Q"]}`),
    );
    expect(metadata?.confidence).toBe(expected);
  });

  it("maps qualitative labels to numeric heuristics", () => {
    for (const [label, expected] of [["low", 0.3], ["medium", 0.6], ["high", 0.85]] as const) {
      const { metadata } = parseSynthesisMetadata(
        wrap(`{"coreTheme": "T", "confidence": "${label}", "questions": ["Q"]}`),
      );
      expect(metadata?.confidence).toBe(expected);
    }
  });

  it("yields null for unusable confidence values", () => {
    const { metadata } = parseSynthesisMetadata(
      wrap('{"coreTheme": "T", "confidence": "very much", "questions": ["Q"]}'),
    );
    expect(metadata?.confidence).toBeNull();
  });
});

describe("parseSynthesisMetadata — questions", () => {
  it("accepts fewer than 5 questions without failing", () => {
    const { metadata } = parseSynthesisMetadata(
      wrap('{"coreTheme": "T", "confidence": 0.9, "questions": ["Q1", "Q2", "Q3", "Q4"]}'),
    );
    expect(metadata?.questions).toHaveLength(4);
  });

  it("accepts more than 5 questions without failing", () => {
    const { metadata } = parseSynthesisMetadata(
      wrap('{"coreTheme": "T", "confidence": 0.9, "questions": ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"]}'),
    );
    expect(metadata?.questions).toHaveLength(6);
  });

  it("removes empty and whitespace-only questions", () => {
    const { metadata } = parseSynthesisMetadata(
      wrap('{"coreTheme": "T", "confidence": 0.9, "questions": ["Q1", "", "   ", "Q2"]}'),
    );
    expect(metadata?.questions).toEqual(["Q1", "Q2"]);
  });

  it("caps questions at the storage bound", () => {
    const questions = Array.from({ length: 15 }, (_, i) => `Q${i + 1}`);
    const { metadata } = parseSynthesisMetadata(
      wrap(`{"coreTheme": "T", "confidence": 0.9, "questions": ${JSON.stringify(questions)}}`),
    );
    expect(metadata?.questions).toHaveLength(10);
  });

  it("treats a non-array questions value as empty", () => {
    const { metadata } = parseSynthesisMetadata(
      wrap('{"coreTheme": "T", "confidence": 0.9, "questions": "just one"}'),
    );
    expect(metadata?.questions).toEqual([]);
  });
});

describe("parseSynthesisMetadata — fallbacks", () => {
  it("returns null metadata for invalid JSON between the markers", () => {
    const content = `Doc.\n\n${wrap('{"coreTheme": broken json')}`;
    const { content: stripped, metadata } = parseSynthesisMetadata(content);
    expect(metadata).toBeNull();
    expect(stripped).toBe("Doc.");
  });

  it("returns null metadata for a completely empty payload", () => {
    const { metadata } = parseSynthesisMetadata(wrap('{"coreTheme": null, "confidence": null, "questions": []}'));
    expect(metadata).toBeNull();
  });

  it("never throws on malformed input", () => {
    expect(() => parseSynthesisMetadata("")).not.toThrow();
    expect(() => parseSynthesisMetadata(METADATA_START_MARKER)).not.toThrow();
    expect(() => parseSynthesisMetadata(`x${METADATA_START_MARKER}not json`)).not.toThrow();
  });
});