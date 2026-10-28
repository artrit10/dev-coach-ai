import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { useRef, useState } from "react";
import { Chat } from "./Chat";
import { EXAMPLES } from "./examples";
import { Header } from "./Header";
import { ReviewResults } from "./ReviewResults";

type Language = "" | "typescript" | "react" | "dotnet";

// Mirrors the server's review schema (server/src/schema.ts).
export type Finding = {
  id: number;
  severity: "high" | "medium" | "low";
  title: string;
  line: number | null;
  explanation: string;
  recommendation: string;
};
export type Review = { summary: string; findings: Finding[] };

const MAX_CODE_CHARS = 20_000;

// Monaco picks its language from the file path, so ".tsx" gives us JSX highlighting.
const EDITOR_FILE: Record<Language, { path: string; language: string }> = {
  "": { path: "snippet.tsx", language: "typescript" },
  typescript: { path: "snippet.ts", language: "typescript" },
  react: { path: "snippet.tsx", language: "typescript" },
  dotnet: { path: "snippet.cs", language: "csharp" },
};

// Snippets are reviewed by the AI, not compiled, so hide errors like "cannot find module".
const configureMonaco: BeforeMount = (monaco) => {
  const ts = monaco.languages.typescript;
  ts.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true });
  ts.typescriptDefaults.setCompilerOptions({
    jsx: ts.JsxEmit.React,
    target: ts.ScriptTarget.ES2022,
    allowNonTsExtensions: true,
  });
};

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function App() {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState<Language>("");
  const [review, setReview] = useState<Review | null>(null);
  // The code that was actually reviewed, so follow-up questions still match if the editor changes.
  const [reviewedCode, setReviewedCode] = useState("");
  const [reviewRun, setReviewRun] = useState(0);
  const [redacted, setRedacted] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const tooLong = code.length > MAX_CODE_CHARS;
  const canSubmit = !loading && code.trim().length > 0 && !tooLong;

  async function submit() {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    setReview(null);
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ...(language && { language }) }),
      });
      const data: { review?: Review; redacted?: number; error?: string } = await response.json().catch(() => ({}));
      if (!response.ok || !data.review) {
        throw new Error(data.error ?? "The review failed. Please try again.");
      }
      setReview(data.review);
      setReviewedCode(code);
      setRedacted(data.redacted ?? 0);
      setReviewRun((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  // The editor's keyboard shortcut is registered once, so it calls through a ref to reach the latest submit.
  const submitRef = useRef(submit);
  submitRef.current = submit;

  const onEditorMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => void submitRef.current());
  };

  function clearAll() {
    setCode("");
    setReview(null);
    setError("");
  }

  return (
    <div className="app">
      <Header />

      <main className="workspace">
        <section className="panel input-panel" aria-label="Your code">
          <p className="warning">
            Do not paste proprietary code, credentials or personal data. Reviews are AI recommendations, not verified
            bugs.
          </p>

          <div className="field-row">
            <div className="field">
              <label htmlFor="language">Language</label>
              <select id="language" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                <option value="">Auto-detect</option>
                <option value="typescript">TypeScript</option>
                <option value="react">React</option>
                <option value="dotnet">.NET (C#)</option>
              </select>
            </div>
            <div className="field examples">
              <span id="examples-label">Try an example</span>
              <div className="chips" role="group" aria-labelledby="examples-label">
                {EXAMPLES.map((example) => (
                  <button
                    key={example.id}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setCode(example.code);
                      setLanguage(example.language);
                    }}
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <span id="code-label" className="label">Code</span>
          <div className="editor" role="group" aria-labelledby="code-label">
            <Editor
              height="460px"
              theme="vs-dark"
              path={EDITOR_FILE[language].path}
              language={EDITOR_FILE[language].language}
              value={code}
              onChange={(value) => setCode(value ?? "")}
              beforeMount={configureMonaco}
              onMount={onEditorMount}
              loading="Loading editor..."
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: "on",
                padding: { top: 8 },
              }}
            />
            {!code && <div className="editor-placeholder">Paste a TypeScript, React or .NET snippet here</div>}
          </div>

          <div className="actions">
            <button type="button" className="primary" onClick={() => void submit()} disabled={!canSubmit}>
              {loading ? "Reviewing..." : "Review my code"}
            </button>
            <button type="button" className="ghost" onClick={clearAll} disabled={loading || (!code && !review)}>
              Clear
            </button>
            <span className="hint">{isMac ? "Cmd" : "Ctrl"} + Enter</span>
            <span className={tooLong ? "counter over" : "counter"}>
              {code.length.toLocaleString()} / {MAX_CODE_CHARS.toLocaleString()}
            </span>
          </div>
        </section>

        <section className="panel results-panel" aria-label="Results" aria-live="polite">
          {error && <p role="alert" className="error">{error}</p>}

          {loading && (
            <div className="loading" role="status">
              <div className="spinner" aria-hidden="true" />
              <p>
                <strong>Reviewing your code...</strong>
                <br />
                This usually takes 10 to 30 seconds.
              </p>
            </div>
          )}

          {!loading && !review && !error && (
            <div className="empty">
              <h2>Your review will appear here</h2>
              <ol>
                <li>Paste code or pick an example</li>
                <li>Click <strong>Review my code</strong></li>
                <li>Read the findings, then ask follow-up questions</li>
              </ol>
            </div>
          )}

          {!loading && review && (
            <>
              <ReviewResults review={review} redacted={redacted} />
              <Chat key={reviewRun} code={reviewedCode} review={review} />
            </>
          )}
        </section>
      </main>

      <footer className="footer">
        DevCoach AI gives recommendations, not verified bugs. Submitted code is not stored, and likely secrets are
        masked before it is sent to the AI.
      </footer>
    </div>
  );
}
