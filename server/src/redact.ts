export type RedactionResult = { text: string; count: number };

// Line numbers in findings must still match the submitted code, so replacements never remove newlines.
type Rule = { pattern: RegExp; replace: (match: string, ...groups: string[]) => string };

const fixed = (label: string) => () => `[REDACTED_${label}]`;

const RULES: Rule[] = [
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: (match) => `[REDACTED_PRIVATE_KEY]${"\n".repeat(match.split("\n").length - 1)}`,
  },
  { pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g, replace: fixed("API_KEY") },
  { pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g, replace: fixed("API_KEY") },
  { pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replace: fixed("AWS_KEY") },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}/g, replace: fixed("GITHUB_TOKEN") },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{50,}/g, replace: fixed("GITHUB_TOKEN") },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, replace: fixed("SLACK_TOKEN") },
  { pattern: /\bAIza[0-9A-Za-z_-]{35}/g, replace: fixed("GOOGLE_KEY") },
  { pattern: /\b[sr]k_live_[0-9A-Za-z]{16,}/g, replace: fixed("STRIPE_KEY") },
  { pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, replace: fixed("JWT") },
  // Passwords inside connection strings, like postgres://user:pass@host
  {
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@"'`]+:)([^\s@"'`/]+)(@)/gi,
    replace: (_m, start = "", _password, at = "") => `${start}[REDACTED_PASSWORD]${at}`,
  },
  // String literals assigned to names that look like secrets. The name stays, so the AI can still flag it.
  {
    pattern: /(\b[\w.-]*(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|token|credential)s?[\w.-]*["']?\s*[:=]\s*)(["'`])((?:(?!\2)[^\n]){6,})\2/gi,
    replace: (match, start = "", quote = "", value = "") =>
      value.startsWith("[REDACTED") ? match : `${start}${quote}[REDACTED_SECRET]${quote}`,
  },
];

export function redactSecrets(input: string): RedactionResult {
  let count = 0;
  let text = input;
  for (const { pattern, replace } of RULES) {
    text = text.replace(pattern, (match, ...args: unknown[]) => {
      const groups = args.filter((a): a is string => typeof a === "string").slice(0, -1);
      const replacement = replace(match, ...groups);
      if (replacement !== match) count++;
      return replacement;
    });
  }
  return { text, count };
}
