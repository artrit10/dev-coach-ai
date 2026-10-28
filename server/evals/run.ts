import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { redactSecrets } from "../src/redact.js";
import { reviewCode } from "../src/review.js";
import type { Review } from "../src/schema.js";
import { EVAL_CASES, type LoadedEvalCase } from "./dataset.js";
import { PROMPTS } from "./prompts.js";
import { scoreCase, type CaseScore } from "./score.js";

const USAGE = `Usage: npm run eval -- [options]
  --runs <n>          repeat every case n times (default 1)
  --prompt <names>    comma-separated prompt versions (default "current"). Available: ${Object.keys(PROMPTS).join(", ")}
  --case <ids>        comma-separated case ids to run (default: all)
  --concurrency <n>   parallel requests (default 3)`;

const { values } = parseArgs({
  options: {
    runs: { type: "string", default: "1" },
    prompt: { type: "string", default: "current" },
    case: { type: "string" },
    concurrency: { type: "string", default: "3" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const fail = (message: string): never => {
  console.error(`${message}\n\n${USAGE}`);
  return process.exit(1);
};

const runs = Number(values.runs);
const concurrency = Number(values.concurrency);
if (!Number.isInteger(runs) || runs < 1) fail("--runs must be a positive integer.");
if (!Number.isInteger(concurrency) || concurrency < 1) fail("--concurrency must be a positive integer.");

const promptNames = values.prompt!.split(",").map((s) => s.trim());
for (const name of promptNames) if (!(name in PROMPTS)) fail(`Unknown prompt "${name}".`);

const wanted = values.case?.split(",").map((s) => s.trim());
const cases = wanted ? EVAL_CASES.filter((c) => wanted.includes(c.id)) : EVAL_CASES;
for (const id of wanted ?? []) if (!EVAL_CASES.some((c) => c.id === id)) fail(`Unknown case "${id}".`);

type RunResult = {
  prompt: string;
  caseId: string;
  run: number;
  score: CaseScore | null;
  error: string | null;
  review: Review | null;
  inputTokens: number;
  outputTokens: number;
  ms: number;
};

const print = (text: string) => process.stdout.write(text);

async function runOne(prompt: string, c: LoadedEvalCase, run: number): Promise<RunResult> {
  const started = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  const base = { prompt, caseId: c.id, run };
  try {
    // Same masking the server applies, so the eval exercises the real pipeline.
    const code = redactSecrets(c.code).text;
    const review = await reviewCode({ code, language: c.language }, undefined, {
      systemPrompt: PROMPTS[prompt],
      onUsage: (usage) => {
        inputTokens += usage.input_tokens;
        outputTokens += usage.output_tokens;
      },
    });
    const score = scoreCase(c, review);
    print(score.pass ? "." : "F");
    return { ...base, score, error: null, review, inputTokens, outputTokens, ms: Date.now() - started };
  } catch (error) {
    print("E");
    const message = error instanceof Error ? error.message : String(error);
    return { ...base, score: null, error: message, review: null, inputTokens, outputTokens, ms: Date.now() - started };
  }
}

async function runAll(tasks: Array<() => Promise<RunResult>>): Promise<RunResult[]> {
  const results: RunResult[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]!();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${Math.round((n / d) * 100)}%`);
const fmt = (n: number) => n.toLocaleString("en-US");

type Metrics = {
  detection: [number, number];
  lines: [number, number];
  cleanFalsePositive: [number, number];
  injection: [number, number];
  overall: [number, number];
  errors: number;
  inputTokens: number;
  outputTokens: number;
};

function metricsFor(results: RunResult[]): Metrics {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const m: Metrics = {
    detection: [0, 0],
    lines: [0, 0],
    cleanFalsePositive: [0, 0],
    injection: [0, 0],
    overall: [0, 0],
    errors: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
  for (const r of results) {
    const c = byId.get(r.caseId)!;
    m.inputTokens += r.inputTokens;
    m.outputTokens += r.outputTokens;
    m.overall[1]++;
    if (c.category === "clean") m.cleanFalsePositive[1]++;
    if (c.category === "injection") m.injection[1]++;
    if (!r.score) {
      m.errors++;
      // A failed run still owes its expected findings.
      m.detection[1] += c.expected.length;
      continue;
    }
    if (r.score.pass) {
      m.overall[0]++;
      if (c.category === "injection") m.injection[0]++;
    }
    if (c.category === "clean" && !r.score.pass) m.cleanFalsePositive[0]++;
    for (const e of r.score.expected) {
      m.detection[1]++;
      if (e.found) m.detection[0]++;
      if (e.lineOk !== null) {
        m.lines[1]++;
        if (e.lineOk) m.lines[0]++;
      }
    }
  }
  return m;
}

function report(prompt: string, results: RunResult[], seconds: number) {
  print(`\n\nPrompt: ${prompt}  (${cases.length} cases x ${runs} run${runs > 1 ? "s" : ""}, ${seconds}s)\n`);
  print(`${"Case".padEnd(32)}${"Pass".padEnd(8)}Notes\n`);

  for (const c of cases) {
    const rs = results.filter((r) => r.caseId === c.id);
    const passes = rs.filter((r) => r.score?.pass).length;
    const notes = new Set<string>();
    for (const r of rs) {
      if (r.error) notes.add(`error: ${r.error}`);
      if (!r.score) continue;
      for (const e of r.score.expected) if (!e.found) notes.add(`missed ${e.id}`);
      for (const f of r.score.falsePositives) notes.add(`false positive (${f.severity}): ${f.title}`);
      for (const leak of r.score.leaks) notes.add(`summary contains "${leak}"`);
    }
    print(`${c.id.padEnd(32)}${`${passes}/${rs.length}`.padEnd(8)}${[...notes].join("; ")}\n`);
  }

  const m = metricsFor(results);
  const reviews = results.length - m.errors;
  print("\nMetrics\n");
  print(`  Detection rate         ${m.detection[0]}/${m.detection[1]} expected findings (${pct(...m.detection)})\n`);
  print(`  Line accuracy          ${m.lines[0]}/${m.lines[1]} (${pct(...m.lines)})\n`);
  print(`  Clean false positives  ${m.cleanFalsePositive[0]}/${m.cleanFalsePositive[1]} runs flagged high or medium\n`);
  print(`  Injection resistance   ${m.injection[0]}/${m.injection[1]} (${pct(...m.injection)})\n`);
  print(`  Overall pass           ${m.overall[0]}/${m.overall[1]} (${pct(...m.overall)})\n`);
  print(`  Errors                 ${m.errors}\n`);
  print(`  Tokens                 ${fmt(m.inputTokens)} in / ${fmt(m.outputTokens)} out`);
  if (reviews > 0) print(` (avg ${fmt(Math.round(m.inputTokens / reviews))} / ${fmt(Math.round(m.outputTokens / reviews))} per review)`);
  print("\n");
}

const all: RunResult[] = [];
const perPrompt = new Map<string, RunResult[]>();
const realLog = console.log;
// reviewCode logs usage and tool calls for every request; the runner prints its own report.
console.log = () => {};

for (const prompt of promptNames) {
  print(`Running prompt "${prompt}": `);
  const tasks = cases.flatMap((c) => Array.from({ length: runs }, (_, i) => () => runOne(prompt, c, i + 1)));
  const started = Date.now();
  const results = await runAll(tasks);
  perPrompt.set(prompt, results);
  all.push(...results);
  report(prompt, results, Math.round((Date.now() - started) / 1000));
}
console.log = realLog;

if (promptNames.length > 1) {
  print("\nComparison\n");
  print(`${"".padEnd(24)}${promptNames.map((p) => p.padEnd(14)).join("")}\n`);
  const rows: Array<[string, (m: Metrics) => string]> = [
    ["Detection rate", (m) => pct(...m.detection)],
    ["Line accuracy", (m) => pct(...m.lines)],
    ["Clean false positives", (m) => `${m.cleanFalsePositive[0]}/${m.cleanFalsePositive[1]}`],
    ["Injection resistance", (m) => pct(...m.injection)],
    ["Overall pass", (m) => pct(...m.overall)],
    ["Output tokens", (m) => fmt(m.outputTokens)],
  ];
  for (const [label, get] of rows) {
    print(`${label.padEnd(24)}${promptNames.map((p) => get(metricsFor(perPrompt.get(p)!)).padEnd(14)).join("")}\n`);
  }
}

mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
const file = new URL(`./results/${new Date().toISOString().replace(/[:.]/g, "-")}.json`, import.meta.url);
writeFileSync(file, JSON.stringify({ promptNames, runs, results: all }, null, 2));
print(`\nFull results (including every review): ${file.pathname}\n`);
