import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const LANGUAGES = ["typescript", "react", "dotnet"] as const;
export type Language = (typeof LANGUAGES)[number];

// The review rules DevCoach applies. Read-only, static text: the tool never touches the filesystem or network.
const GUIDELINES: Record<Language, string> = {
  typescript: `TypeScript review rules
HIGH
- Untrusted input used without validation (JSON.parse results, request bodies, env vars) and then trusted as a typed value.
- SQL, shell or HTML built by string concatenation or template literals with user data.
- Secrets or credentials in source code.
- Unhandled promise rejections: missing await, floating promises, async callbacks passed where a sync one is expected.
MEDIUM
- "any", non-null assertions (!) and "as" casts that hide a real type problem.
- Swallowed errors (empty catch, catch that only logs and continues as if it worked).
- Mutating function arguments or shared module state.
- Loose equality (==) and truthiness checks that treat 0 or "" as missing.
LOW
- Missing explicit return types on exported functions.
- Unused variables and imports, dead code.
- Inconsistent naming, magic numbers, deeply nested conditionals that early returns would flatten.`,

  react: `React review rules
HIGH
- dangerouslySetInnerHTML with unsanitised data.
- Missing or wrong useEffect dependencies that cause stale data or infinite loops.
- State updated during render, or hooks called conditionally or inside loops.
- Effects that start requests or subscriptions without cleanup or cancellation (race conditions on fast prop changes).
MEDIUM
- Array index used as a list key where items can reorder or be removed.
- Mutating state directly instead of creating a new object or array.
- Derived data stored in state instead of computed during render.
- Missing loading and error states for async data.
- Interactive elements that are not keyboard accessible (clickable div instead of button), missing labels on inputs.
LOW
- Inline object or function props that break memoisation, only worth flagging when a memoised child is involved.
- Very large components that mix data fetching and presentation.
- Prop drilling through many levels where context or composition would be simpler.`,

  dotnet: `.NET (C#) review rules
HIGH
- SQL built by string concatenation or interpolation instead of parameters.
- async void methods outside event handlers, and blocking on tasks with .Result or .Wait() (deadlocks).
- Secrets or connection strings in source code.
- IDisposable objects (streams, HttpClient per request, DbContext) not disposed or created in a loop.
MEDIUM
- Catching Exception and swallowing it, or "throw ex;" that resets the stack trace.
- Missing null checks where nullable reference types are enabled, or the null-forgiving operator (!) hiding a real null.
- Missing CancellationToken on I/O-bound async methods.
- Mutable static state shared across requests.
- Entity Framework queries that load whole tables and filter in memory, or N+1 query patterns.
LOW
- Missing "Async" suffix on async methods, inconsistent naming (PascalCase for public members).
- Magic strings and numbers, unused usings, overly long methods.
- String concatenation in loops where StringBuilder fits.`,
};

export const GET_LANGUAGE_GUIDELINES = "get_language_guidelines";

export const languageGuidelinesTool: Anthropic.Tool = {
  name: GET_LANGUAGE_GUIDELINES,
  description:
    "Returns DevCoach's review rules for one language, grouped by severity. " +
    "Call this once for each language that appears in the submitted code before writing findings.",
  input_schema: {
    type: "object",
    properties: {
      language: {
        type: "string",
        enum: [...LANGUAGES],
        description: "typescript for plain TypeScript or Node code, react for React components and hooks, dotnet for C#",
      },
    },
    required: ["language"],
  },
};

const toolInput = z.object({ language: z.enum(LANGUAGES) });

export type ToolResult = { content: string; isError: boolean };

// Runs a tool the model asked for. Never throws: bad input comes back as an error result the model can read.
export function runTool(name: string, input: unknown): ToolResult {
  if (name !== GET_LANGUAGE_GUIDELINES) {
    return { content: `Unknown tool: ${name}`, isError: true };
  }
  const parsed = toolInput.safeParse(input);
  if (!parsed.success) {
    return { content: `Invalid input. language must be one of: ${LANGUAGES.join(", ")}.`, isError: true };
  }
  return { content: GUIDELINES[parsed.data.language], isError: false };
}
