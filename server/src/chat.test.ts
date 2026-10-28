import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { MAX_HISTORY_MESSAGES, buildMessages, chatAboutReview, type ChatMessage } from "./chat.js";
import type { MessagesApi, ReviewError } from "./review.js";
import type { Review } from "./schema.js";

const review: Review = {
  summary: "Has a bug.",
  findings: [{ id: 1, severity: "high", title: "Bug", line: 1, explanation: "Because.", recommendation: "Fix it." }],
};

const base = { code: "const a = 1;", review, history: [] as ChatMessage[], question: "How do I fix finding 1?" };

const turns = (pairs: number): ChatMessage[] =>
  Array.from({ length: pairs }, (_, i): ChatMessage[] => [
    { role: "user", content: `q${i}` },
    { role: "assistant", content: `a${i}` },
  ]).flat();

function reply(text: string, stopReason = "end_turn"): Anthropic.Message {
  return {
    id: "m",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: text === "" ? [] : [{ type: "text", text, citations: null }],
    stop_reason: stopReason,
    usage: { input_tokens: 10, output_tokens: 10 },
  } as unknown as Anthropic.Message;
}

function fakeApi(result: Anthropic.Message | Error) {
  const create = vi.fn();
  if (result instanceof Error) create.mockRejectedValue(result);
  else create.mockResolvedValue(result);
  return { api: { messages: { create } } as MessagesApi, create };
}

describe("buildMessages", () => {
  it("puts the code and review first, then the question", () => {
    const messages = buildMessages(base);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[0]!.content).toMatch(/<code>\nconst a = 1;\n<\/code>/);
    expect(messages[0]!.content).toMatch(/<review>/);
    expect(messages[2]).toEqual({ role: "user", content: "How do I fix finding 1?" });
  });

  it("keeps a short history in order", () => {
    const messages = buildMessages({ ...base, history: turns(2) });
    expect(messages.slice(2, 6).map((m) => m.content)).toEqual(["q0", "a0", "q1", "a1"]);
  });

  it("drops the oldest turns once history is too long, but always keeps the code and review", () => {
    const messages = buildMessages({ ...base, history: turns(10) });
    const history = messages.slice(2, -1);
    expect(history).toHaveLength(MAX_HISTORY_MESSAGES);
    expect(history[0]).toEqual({ role: "user", content: "q5" });
    expect(messages[0]!.content).toMatch(/<code>/);
  });

  it("never starts the kept history with an assistant turn", () => {
    const odd = turns(4).slice(1); // a0 q1 a1 ... would start with assistant
    const messages = buildMessages({ ...base, history: odd });
    expect(messages[2]!.role).toBe("user");
  });
});

describe("chatAboutReview", () => {
  it("returns the model's answer", async () => {
    const { api, create } = fakeApi(reply("  Use a parameterized query.  "));
    await expect(chatAboutReview(base, api)).resolves.toBe("Use a parameterized query.");
    const sent = create.mock.calls[0]![0] as Anthropic.MessageCreateParamsNonStreaming;
    expect(sent.tools).toBeUndefined();
    expect(sent.system).toMatch(/untrusted/);
  });

  it("flags an answer that was cut off", async () => {
    const { api } = fakeApi(reply("Partial", "max_tokens"));
    await expect(chatAboutReview(base, api)).resolves.toMatch(/cut off/);
  });

  it("fails with a 502 on an empty answer", async () => {
    const { api } = fakeApi(reply(""));
    const error = (await chatAboutReview(base, api).catch((e: unknown) => e)) as ReviewError;
    expect(error.statusCode).toBe(502);
  });

  it("maps API errors like the review endpoint does", async () => {
    const { api } = fakeApi(new Anthropic.RateLimitError(429, undefined, "slow down", new Headers()));
    const error = (await chatAboutReview(base, api).catch((e: unknown) => e)) as ReviewError;
    expect(error.statusCode).toBe(429);
  });
});
