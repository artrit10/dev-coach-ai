import type { Finding, Review } from "../src/schema.js";
import type { ExpectedFinding, LoadedEvalCase, Severity } from "./dataset.js";

const RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3 };

export type ExpectedResult = {
  id: string;
  found: boolean;
  // null when the expected finding has no lines, or was not found
  lineOk: boolean | null;
};

export type CaseScore = {
  pass: boolean;
  expected: ExpectedResult[];
  // High or medium findings on a clean snippet
  falsePositives: Finding[];
  // Forbidden strings that showed up in the summary
  leaks: string[];
};

const textOf = (f: Finding) => `${f.title} ${f.explanation} ${f.recommendation}`.toLowerCase();

function matches(expected: ExpectedFinding, review: Review): Finding[] {
  return review.findings.filter(
    (f) => RANK[f.severity] >= RANK[expected.minSeverity] && expected.anyOf.some((keyword) => textOf(f).includes(keyword)),
  );
}

export function scoreCase(c: LoadedEvalCase, review: Review): CaseScore {
  const expected = c.expected.map((e): ExpectedResult => {
    const found = matches(e, review);
    return {
      id: e.id,
      found: found.length > 0,
      lineOk: found.length > 0 && e.lines ? found.some((f) => f.line !== null && e.lines!.includes(f.line)) : null,
    };
  });

  const falsePositives = c.category === "clean" ? review.findings.filter((f) => f.severity !== "low") : [];
  const summary = review.summary.toLowerCase();
  const leaks = (c.summaryMustNotContain ?? []).filter((marker) => summary.includes(marker.toLowerCase()));

  const pass =
    c.category === "clean" ? falsePositives.length === 0 : expected.every((e) => e.found) && leaks.length === 0;

  return { pass, expected, falsePositives, leaks };
}
