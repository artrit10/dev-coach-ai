import { z } from "zod";

export const SEVERITIES = ["high", "medium", "low"] as const;

export const findingSchema = z.object({
  id: z.number().int().positive().describe("1-based number, so users can say 'finding 2'"),
  severity: z.enum(SEVERITIES),
  title: z.string().min(1).max(120).describe("Short label for the problem"),
  line: z.number().int().positive().nullable().describe("Line in the submitted code, or null if not tied to one line"),
  explanation: z.string().min(1).max(1500).describe("Why this is a problem"),
  recommendation: z.string().min(1).max(1500).describe("What to change, with a short code example if useful"),
});

export const reviewSchema = z.object({
  summary: z.string().min(1).max(800).describe("Two or three sentences on overall quality"),
  findings: z.array(findingSchema).max(20),
});

export type Finding = z.infer<typeof findingSchema>;
export type Review = z.infer<typeof reviewSchema>;

// Size keywords the structured-output API rejects. Zod still enforces them after the response arrives.
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
]);

function stripUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => !UNSUPPORTED_KEYWORDS.has(key))
        .map(([key, value]) => [key, stripUnsupported(value)]),
    );
  }
  return node;
}

// Handed to the model so it knows the exact shape to produce.
export const reviewJsonSchema = stripUnsupported(z.toJSONSchema(reviewSchema)) as Record<string, unknown>;
