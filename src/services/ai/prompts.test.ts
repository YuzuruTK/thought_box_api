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
