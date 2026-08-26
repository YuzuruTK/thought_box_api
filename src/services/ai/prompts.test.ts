import { describe, expect, it } from "vitest";
import { buildSynthesisPrompt } from "./prompts";

describe("buildSynthesisPrompt", () => {
  it.each([
    ["Portuguese", ["Quero organizar minhas ideias sobre o projeto.", "Preciso definir os próximos passos."]],
    ["English", ["I want to organize my ideas about the project.", "I need to define the next steps."]],
    ["Spanish", ["Quiero organizar mis ideas sobre el proyecto.", "Necesito definir los próximos pasos."]],
  ])("requires synthesis output to match the predominant language (%s)", (language, thoughts) => {
    const prompt = buildSynthesisPrompt({
      boxName: "Test Box",
      thoughts,
    });

    expect(prompt).toContain("Determine the predominant language used by the provided thoughts.");
    expect(prompt).toContain("Write BOTH the resume and the structured document entirely in that same predominant language.");
    expect(prompt).toContain("If the thoughts contain multiple languages, use the language that represents the majority of the meaningful content.");
  });

  it("includes the thoughts that the model must use to determine the output language", () => {
    const prompt = buildSynthesisPrompt({
      boxName: "Mixed Language",
      thoughts: [
        "Este pensamiento está em espanhol.",
        "Este pensamento está em português.",
        "Este pensamento também está em português.",
      ],
    });

    expect(prompt).toContain("1. Este pensamento está em espanhol.");
    expect(prompt).toContain("2. Este pensamento está em português.");
    expect(prompt).toContain("3. Este pensamento também está em português.");
    expect(prompt).toContain("majority of the meaningful content");
  });
});
