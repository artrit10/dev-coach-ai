import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { ReviewError, reviewCode, type MessagesApi } from "./review.js";

const validReview = {
  summary: "Looks mostly fine.",
  findings: [
    {
      id: 1,
      severity: "high",
      title: "SQL injection",
      line: 2,
      explanation: "The id is concatenated into the query.",
      recommendation: "Use a parameterized query.",
    },
  ],
};

function reply(text: string, stopReason = "end_turn"): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: text === "" ? [] : [{ type: "text", text, citations: null }],
    stop_reason: stopReason,
    usage: { input_tokens: 10, output_tokens: 10 },
  } as unknown as Anthropic.Message;
}

function fakeApi(...results: Array<Anthropic.Message | Error>) {
  const create = vi.fn();
  for (const result of results) {
    if (result instanceof Error) create.mockRejectedValueOnce(result);
    else create.mockResolvedValueOnce(result);
  }
  return { api: { messages: { create } } as MessagesApi, create };
}

const request = { code: "const a = 1;" };

async function failure(promise: Promise<unknown>): Promise<ReviewError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ReviewError);
  return error as ReviewError;
}

describe("reviewCode", () => {
  it("returns a valid review on the first attempt", async () => {
    const { api, create } = fakeApi(reply(JSON.stringify(validReview)));
    await expect(reviewCode(request, api)).resolves.toEqual(validReview);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("accepts a review with no findings", async () => {
    const { api } = fakeApi(reply(JSON.stringify({ summary: "Clean.", findings: [] })));
    await expect(reviewCode(request, api)).resolves.toEqual({ summary: "Clean.", findings: [] });
  });

  it("accepts a finding that is not tied to a line", async () => {
    const review = { ...validReview, findings: [{ ...validReview.findings[0], line: null }] };
    const { api } = fakeApi(reply(JSON.stringify(review)));
    await expect(reviewCode(request, api)).resolves.toEqual(review);
  });

  it("retries once when the first reply is not JSON", async () => {
    const { api, create } = fakeApi(reply("Sure! Here is my review: ..."), reply(JSON.stringify(validReview)));
    await expect(reviewCode(request, api)).resolves.toEqual(validReview);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("retries when JSON is wrapped in a markdown fence", async () => {
    const fenced = "```json\n" + JSON.stringify(validReview) + "\n```";
    const { api, create } = fakeApi(reply(fenced), reply(JSON.stringify(validReview)));
    await reviewCode(request, api);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("retries when the JSON is truncated mid-object", async () => {
    const cut = JSON.stringify(validReview).slice(0, 60);
    const { api, create } = fakeApi(reply(cut), reply(JSON.stringify(validReview)));
    await reviewCode(request, api);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("retries when the model returns no text at all", async () => {
    const { api, create } = fakeApi(reply(""), reply(JSON.stringify(validReview)));
    await reviewCode(request, api);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["a missing summary", { findings: validReview.findings }],
    ["a missing findings list", { summary: "Hi" }],
    ["an unknown severity", { ...validReview, findings: [{ ...validReview.findings[0], severity: "critical" }] }],
    ["a finding with no recommendation", { ...validReview, findings: [{ ...validReview.findings[0], recommendation: undefined }] }],
    ["a string line number", { ...validReview, findings: [{ ...validReview.findings[0], line: "2" }] }],
    ["line 0", { ...validReview, findings: [{ ...validReview.findings[0], line: 0 }] }],
    ["an empty explanation", { ...validReview, findings: [{ ...validReview.findings[0], explanation: "" }] }],
    ["an oversized explanation", { ...validReview, findings: [{ ...validReview.findings[0], explanation: "x".repeat(1501) }] }],
    ["more than 20 findings", { ...validReview, findings: Array.from({ length: 21 }, (_, i) => ({ ...validReview.findings[0], id: i + 1 })) }],
    ["a top-level array", [validReview]],
  ])("gives up with a 502 after two attempts when the reply has %s", async (_name, bad) => {
    const { api, create } = fakeApi(reply(JSON.stringify(bad)), reply(JSON.stringify(bad)));
    const error = await failure(reviewCode(request, api));
    expect(error.statusCode).toBe(502);
    expect(error.message).toMatch(/unexpected format/);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not retry a reply that was cut off at max_tokens", async () => {
    const { api, create } = fakeApi(reply('{"summary": "Too lo', "max_tokens"));
    const error = await failure(reviewCode(request, api));
    expect(error.statusCode).toBe(502);
    expect(error.message).toMatch(/cut off/);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("maps a 429 from the API to a friendly 429", async () => {
    const rateLimit = new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers());
    const { api } = fakeApi(rateLimit);
    const error = await failure(reviewCode(request, api));
    expect(error.statusCode).toBe(429);
    expect(error.message).toMatch(/try again/i);
  });

  it("maps a rejected key to a 500 without leaking details", async () => {
    const authError = new Anthropic.AuthenticationError(401, undefined, "invalid x-api-key sk-ant-secret", new Headers());
    const { api } = fakeApi(authError);
    const error = await failure(reviewCode(request, api));
    expect(error.statusCode).toBe(500);
    expect(error.message).not.toMatch(/sk-ant/);
  });

  it("maps an unknown crash to a generic 500", async () => {
    const { api } = fakeApi(new Error("socket hang up"));
    const error = await failure(reviewCode(request, api));
    expect(error.statusCode).toBe(500);
    expect(error.message).not.toMatch(/socket/);
  });
});

function toolReply(...calls: Array<{ id: string; name: string; input: unknown }>): Anthropic.Message {
  return {
    id: "msg_tool",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: calls.map((c) => ({ type: "tool_use", ...c })),
    stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 10 },
  } as unknown as Anthropic.Message;
}

const guidelinesCall = (id: string, language: unknown) => ({ id, name: "get_language_guidelines", input: { language } });

describe("reviewCode tool loop", () => {
  it("runs the tool, sends the result back, and returns the final review", async () => {
    const { api, create } = fakeApi(toolReply(guidelinesCall("t1", "typescript")), reply(JSON.stringify(validReview)));
    await expect(reviewCode(request, api)).resolves.toEqual(validReview);
    expect(create).toHaveBeenCalledTimes(2);

    const sent = create.mock.calls[1]![0] as Anthropic.MessageCreateParamsNonStreaming;
    const toolResult = (sent.messages[2]!.content as Anthropic.ToolResultBlockParam[])[0]!;
    expect(sent.messages[1]!.role).toBe("assistant");
    expect(toolResult).toMatchObject({ type: "tool_result", tool_use_id: "t1", is_error: false });
    expect(toolResult.content).toMatch(/TypeScript review rules/);
  });

  it("answers several tool calls from one turn", async () => {
    const { api, create } = fakeApi(
      toolReply(guidelinesCall("t1", "typescript"), guidelinesCall("t2", "react")),
      reply(JSON.stringify(validReview)),
    );
    await reviewCode(request, api);
    const sent = create.mock.calls[1]![0] as Anthropic.MessageCreateParamsNonStreaming;
    const results = sent.messages[2]!.content as Anthropic.ToolResultBlockParam[];
    expect(results.map((r) => r.tool_use_id)).toEqual(["t1", "t2"]);
  });

  it("returns a tool error to the model instead of failing the review", async () => {
    const { api, create } = fakeApi(toolReply(guidelinesCall("t1", "python")), reply(JSON.stringify(validReview)));
    await expect(reviewCode(request, api)).resolves.toEqual(validReview);
    const sent = create.mock.calls[1]![0] as Anthropic.MessageCreateParamsNonStreaming;
    const toolResult = (sent.messages[2]!.content as Anthropic.ToolResultBlockParam[])[0]!;
    expect(toolResult.is_error).toBe(true);
  });

  it("refuses to run an unknown tool but keeps going", async () => {
    const { api } = fakeApi(toolReply({ id: "t1", name: "read_file", input: { path: "/etc/passwd" } }), reply(JSON.stringify(validReview)));
    await expect(reviewCode(request, api)).resolves.toEqual(validReview);
  });

  it("stops a model that keeps calling tools and removes tools on the last call", async () => {
    const loop = Array.from({ length: 4 }, (_, i) => toolReply(guidelinesCall(`t${i}`, "typescript")));
    const { api, create } = fakeApi(...loop, reply(JSON.stringify(validReview)));
    await expect(reviewCode(request, api)).resolves.toEqual(validReview);
    expect(create).toHaveBeenCalledTimes(5);
    const last = create.mock.calls[4]![0] as Anthropic.MessageCreateParamsNonStreaming;
    expect(last.tools).toBeUndefined();
    const first = create.mock.calls[0]![0] as Anthropic.MessageCreateParamsNonStreaming;
    expect(first.tools).toHaveLength(1);
  });

  it("fails cleanly if the model still wants a tool on the final call", async () => {
    const loop = Array.from({ length: 5 }, (_, i) => toolReply(guidelinesCall(`t${i}`, "typescript")));
    const { api, create } = fakeApi(...loop);
    const error = await failure(reviewCode(request, api));
    expect(error.statusCode).toBe(502);
    expect(create).toHaveBeenCalledTimes(5);
  });
});
