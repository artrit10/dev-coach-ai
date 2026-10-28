import { SYSTEM_PROMPT } from "../src/review.js";

// Prompt versions the eval runner can compare. Add a new entry to test a change.
export const PROMPTS: Record<string, string> = {
  // The prompt the app uses today.
  current: SYSTEM_PROMPT,

  // A deliberately bare baseline: no severity guidance, no untrusted-input rules, no tool instruction.
  basic: "You are a code reviewer. Review the code the user sends and return your findings.",
};
