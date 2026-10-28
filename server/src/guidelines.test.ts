import { describe, expect, it } from "vitest";
import { GET_LANGUAGE_GUIDELINES, LANGUAGES, languageGuidelinesTool, runTool } from "./guidelines.js";

describe("runTool", () => {
  it.each(LANGUAGES)("returns rules for %s", (language) => {
    const result = runTool(GET_LANGUAGE_GUIDELINES, { language });
    expect(result.isError).toBe(false);
    expect(result.content).toMatch(/HIGH/);
    expect(result.content).toMatch(/MEDIUM/);
    expect(result.content).toMatch(/LOW/);
  });

  it("returns different rules per language", () => {
    const [a, b, c] = LANGUAGES.map((language) => runTool(GET_LANGUAGE_GUIDELINES, { language }).content);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it.each([
    ["an unsupported language", { language: "python" }],
    ["a missing language", {}],
    ["a non-object input", "typescript"],
    ["null input", null],
    ["a path-like value", { language: "../../.env" }],
  ])("returns an error result for %s", (_name, input) => {
    const result = runTool(GET_LANGUAGE_GUIDELINES, input);
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/typescript, react, dotnet/);
  });

  it("returns an error result for an unknown tool", () => {
    const result = runTool("delete_everything", { language: "typescript" });
    expect(result.isError).toBe(true);
  });
});

describe("languageGuidelinesTool", () => {
  it("offers exactly the supported languages", () => {
    const language = languageGuidelinesTool.input_schema.properties as { language: { enum: string[] } };
    expect(language.language.enum).toEqual([...LANGUAGES]);
  });
});
