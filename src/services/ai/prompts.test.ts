import { describe, expect, it } from "vitest";
import { buildSynthesisPrompt, detectPredominantLanguage } from "./prompts";

describe("detectPredominantLanguage", () => {
  it.each([
    ["pt-BR", ["Quero organizar minhas ideias sobre o projeto.", "Preciso definir os próximos passos."], "Portuguese"],
    ["en", ["I want to organize my ideas about the project.", "I need to define the next steps."], "English"],
    ["es", ["Quiero organizar mis ideas sobre el proyecto.", "Necesito definir los próximos pasos."], "Spanish"],
  ])("detects %s from thoughts", (expected, thoughts) => {
    expect(detectPredominantLanguage(thoughts)).toBe(expected);
  });

  it("uses the predominant language when thoughts are mixed", () => {
    expect(detectPredominantLanguage([
      "Este pensamento está em espanhol.",
      "Este pensamento está em português.",
      "Este pensamento também está em português.",
    ])).toBe("pt-BR");
  });

  it("uses the predominant language when English and Portuguese thoughts are mixed", () => {
    expect(detectPredominantLanguage([
      "This thought is written in English.",
      "Another thought in English about the project.",
      "Este pensamento está em português.",
    ])).toBe("en");
  });
});

describe("buildSynthesisPrompt language propagation", () => {
  it("requires Portuguese output for Portuguese thoughts", () => {
    const prompt = buildSynthesisPrompt({
      boxName: "Projeto",
      thoughts: [
        "Quero organizar minhas ideias sobre o projeto.",
        "Preciso definir os próximos passos da síntese.",
      ],
    });

    expect(prompt).toContain("required output language: Brazilian Portuguese (pt-BR)");
    expect(prompt).toContain("Write BOTH the resume and the structured document entirely in Brazilian Portuguese (pt-BR).");
    expect(prompt).not.toContain("required output language: English (en)");
  });

  it("requires English output for English thoughts", () => {
    const prompt = buildSynthesisPrompt({
      boxName: "Project",
      thoughts: [
        "I want to organize my ideas about the project.",
        "I need to define the next steps of the synthesis.",
      ],
    });

    expect(prompt).toContain("required output language: English (en)");
    expect(prompt).toContain("Write BOTH the resume and the structured document entirely in English (en).");
    expect(prompt).not.toContain("required output language: Brazilian Portuguese (pt-BR)");
  });

  it("selects the predominant language for mixed-language thoughts", () => {
    const prompt = buildSynthesisPrompt({
      boxName: "Mixed Box",
      thoughts: [
        "This thought is written in English.",
        "Another thought in English about the project.",
        "Este pensamento está em português.",
      ],
    });

    expect(prompt).toContain("required output language: English (en)");
    expect(prompt).toContain("the language of the majority of the meaningful content");
  });
});

describe("buildSynthesisPrompt", () => {
  it("uses the application-detected language as authoritative", () => {
    const prompt = buildSynthesisPrompt({
      boxName: "Test Box",
      thoughts: ["Quero organizar minhas ideias sobre o projeto."],
      language: "pt-BR",
    });

    expect(prompt).toContain("The application has determined the required output language: Brazilian Portuguese (pt-BR).");
    expect(prompt).toContain("This language is authoritative.");
    expect(prompt).toContain("Do not infer a different output language from the box name, instructions, model defaults, or any previously generated document.");
  });

  it("detects the language when the caller does not provide one", () => {
    const prompt = buildSynthesisPrompt({
      boxName: "English Previous Summary",
      thoughts: [
        "Estou organizando minhas ideias para o projeto.",
        "Preciso definir os próximos passos e revisar a arquitetura.",
      ],
    });

    expect(prompt).toContain("Brazilian Portuguese (pt-BR)");
    expect(prompt).not.toContain("required output language: English (en)");
  });

  it("does not allow a previous English document context to select English", () => {
    const prompt = buildSynthesisPrompt({
      boxName: "Project Summary in English",
      thoughts: [
        "O projeto precisa organizar os pensamentos do usuário.",
        "A síntese deve ser gerada em português.",
      ],
      language: "pt-BR",
    });

    expect(prompt).toContain("Brazilian Portuguese (pt-BR)");
    expect(prompt).toContain("previously generated document");
  });
});

describe("buildSynthesisPrompt — synthesis metadata", () => {
  function build(thoughts: string[]): string {
    return buildSynthesisPrompt({ boxName: "Test Box", thoughts });
  }

  it("requires the delimited metadata block", () => {
    const prompt = build(["I keep notes about the API design."]);
    expect(prompt).toContain("<<<THOUGHT_BOX_METADATA>>>");
    expect(prompt).toContain("<<<END_THOUGHT_BOX_METADATA>>>");
    expect(prompt).toContain("METADATA OUTPUT FORMAT");
    expect(prompt).toContain("ONLY valid JSON");
  });

  it("requests theme detection with a 0-1 confidence score and exactly 5 questions", () => {
    const prompt = build(["Thought about the project."]);
    expect(prompt).toContain("recurring concepts");
    expect(prompt).toContain("confidence score between 0 and 1");
    expect(prompt).toContain("exactly 5 reflection questions");
    expect(prompt).toContain("heuristic estimate, not a precise measurement");
  });

  it("allows coreTheme to be null instead of forcing a theme", () => {
    const prompt = build(["Thought about the project."]);
    expect(prompt).toContain('"coreTheme" to null');
    expect(prompt).toContain("NEVER invent or force a theme");
  });

  it("explains the high-confidence question strategy", () => {
    const prompt = build(["Thought about the project."]);
    expect(prompt).toContain("If confidence is HIGH (>= 0.6)");
    expect(prompt).toContain("assumptions, risks, constraints, opportunities, and next actions");
  });

  it("explains the low-confidence exploratory strategy", () => {
    const prompt = build(["Thought about the project."]);
    expect(prompt).toContain("If confidence is LOW (< 0.6)");
    expect(prompt).toContain("Do not invent or force a dominant theme.");
    expect(prompt).toContain("5W2H");
    expect(prompt).toContain("separate Boxes");
  });

  it("extends the language requirement to the metadata (Portuguese thoughts)", () => {
    const prompt = build([
      "Quero organizar minhas ideias sobre o projeto.",
      "Preciso definir os próximos passos da síntese.",
    ]);
    expect(prompt).toContain(
      "The reflection questions and any theme/confidence descriptions in the metadata block must also be written entirely in Brazilian Portuguese (pt-BR).",
    );
    expect(prompt).toContain('"questions" must be an array of exactly 5 strings, written entirely in Brazilian Portuguese (pt-BR).');
    expect(prompt).toContain("Never default to English");
  });

  it("extends the language requirement to the metadata (English thoughts)", () => {
    const prompt = build([
      "I want to organize my ideas about the project.",
      "I need to define the next steps of the synthesis.",
    ]);
    expect(prompt).toContain(
      "The reflection questions and any theme/confidence descriptions in the metadata block must also be written entirely in English (en).",
    );
  });

  it("extends the language requirement to the metadata (Spanish thoughts)", () => {
    const prompt = build([
      "Quiero organizar mis ideas sobre el proyecto.",
      "Necesito definir los próximos pasos de la síntesis.",
    ]);
    expect(prompt).toContain(
      "The reflection questions and any theme/confidence descriptions in the metadata block must also be written entirely in Spanish (es).",
    );
  });
});
