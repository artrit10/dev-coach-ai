import { useState, type FormEvent } from "react";
import type { Review } from "./App";
import { RichText } from "./RichText";

type Message = { role: "user" | "assistant"; content: string };

const MAX_QUESTION_CHARS = 1_000;
// The server only uses the last 10 messages anyway, so don't send more.
const MAX_SENT_HISTORY = 10;

type Props = { code: string; review: Review };

export function Chat({ code, review }: Props) {
  const [history, setHistory] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loading = pending !== null;
  const suggestion = review.findings[0] ? `How would you fix finding ${review.findings[0].id}?` : "";

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setPending(trimmed);
    setError("");
    setQuestion("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, review, history: history.slice(-MAX_SENT_HISTORY), question: trimmed }),
      });
      const data: { answer?: string; error?: string } = await response.json().catch(() => ({}));
      if (!response.ok || !data.answer) {
        throw new Error(data.error ?? "The question failed. Please try again.");
      }
      setHistory((h) => [...h, { role: "user", content: trimmed }, { role: "assistant", content: data.answer! }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the server.");
      setQuestion(trimmed);
    } finally {
      setPending(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <section aria-label="Ask about this review" className="chat">
      <h2>Ask about this review</h2>

      {history.length === 0 && !loading && suggestion && (
        <button type="button" className="chip" onClick={() => void ask(suggestion)}>
          {suggestion}
        </button>
      )}

      <ul className="messages">
        {history.map((m, i) => (
          <li key={i} className={`message ${m.role}`}>
            {m.role === "assistant" ? <RichText text={m.content} /> : m.content}
          </li>
        ))}
        {pending && <li className="message user">{pending}</li>}
        {loading && <li className="message assistant thinking">Thinking...</li>}
      </ul>

      {error && <p role="alert" className="error">{error}</p>}

      <form onSubmit={onSubmit} className="chat-form">
        <label htmlFor="question" className="sr-only">Your question</label>
        <input
          id="question"
          value={question}
          maxLength={MAX_QUESTION_CHARS}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Why is finding 2 a problem?"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !question.trim()}>
          {loading ? "Asking..." : "Ask"}
        </button>
      </form>
    </section>
  );
}
