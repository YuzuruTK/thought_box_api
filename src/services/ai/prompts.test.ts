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
