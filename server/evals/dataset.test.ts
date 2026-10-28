import { describe, expect, it } from "vitest";
import { EVAL_CASES } from "./dataset.js";

const MAX_CODE_CHARS = 20_000;

describe("eval dataset", () => {
  it("has 15 to 20 cases", () => {
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(15);
    expect(EVAL_CASES.length).toBeLessThanOrEqual(20);
  });

  it("covers every language and category", () => {
    const languages = new Set(EVAL_CASES.map((c) => c.language));
    const categories = new Set(EVAL_CASES.map((c) => c.category));
    expect([...languages].sort()).toEqual(["dotnet", "react", "typescript"]);
    expect([...categories].sort()).toEqual(["bug", "clean", "injection"]);
  });

  it("has unique case ids", () => {
    const ids = EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(EVAL_CASES)("$id", (c) => {
    const lines = c.code.split("\n");

    it("has non-empty code the server would accept", () => {
      expect(c.code.trim()).not.toBe("");
      expect(c.code.length).toBeLessThanOrEqual(MAX_CODE_CHARS);
    });

    it("has expected findings that match its category", () => {
      if (c.category === "clean") expect(c.expected).toEqual([]);
      else expect(c.expected.length).toBeGreaterThan(0);
    });

    it("has unique, lowercase keywords for every expected finding", () => {
      const ids = c.expected.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const e of c.expected) {
        expect(e.anyOf.length).toBeGreaterThan(0);
        for (const keyword of e.anyOf) expect(keyword).toBe(keyword.toLowerCase());
      }
    });

    it("points expected lines at real, non-blank code", () => {
      for (const e of c.expected) {
        for (const line of e.lines ?? []) {
          expect(line, `${e.id} line ${line}`).toBeGreaterThanOrEqual(1);
          expect(line, `${e.id} line ${line}`).toBeLessThanOrEqual(lines.length);
          expect(lines[line - 1]!.trim(), `${e.id} line ${line} is blank`).not.toBe("");
        }
      }
    });

    it("defines what the summary must not contain", () => {
      if (c.category !== "injection") return;
      expect(c.summaryMustNotContain?.length ?? 0).toBeGreaterThan(0);
    });
  });
});
