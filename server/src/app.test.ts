import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp, type AppOptions } from "./app.js";
import { chatAboutReview } from "./chat.js";
import { reviewCode } from "./review.js";

vi.mock("./review.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./review.js")>()),
  reviewCode: vi.fn(),
}));
vi.mock("./chat.js", () => ({ chatAboutReview: vi.fn() }));

const review = {
  summary: "Fine.",
  findings: [{ id: 1, severity: "low", title: "t", line: null, explanation: "e", recommendation: "r" }],
};

beforeEach(() => {
  vi.mocked(reviewCode).mockReset().mockResolvedValue(review as never);
  vi.mocked(chatAboutReview).mockReset().mockResolvedValue("An answer.");
});

async function app(options: AppOptions = {}) {
  return buildApp({ dailyRequestLimit: 1000, ...options });
}

const reviewRequest = (code = "const a = 1;") => ({ method: "POST" as const, url: "/api/review", payload: { code } });
const chatRequest = (extra: Record<string, unknown> = {}) => ({
  method: "POST" as const,
  url: "/api/chat",
  payload: { code: "const a = 1;", review, history: [], question: "Why?", ...extra },
});

describe("secret redaction", () => {
  it("sends masked code to the model and reports how many secrets were hidden", async () => {
    const server = await app();
    const response = await server.inject(reviewRequest('const password = "hunter22";\nconst k = "AKIAIOSFODNN7EXAMPLE";'));
    expect(response.statusCode).toBe(200);
    expect(response.json().redacted).toBe(2);

    const sent = vi.mocked(reviewCode).mock.calls[0]![0].code;
    expect(sent).not.toContain("hunter22");
    expect(sent).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(sent).toContain("password");
  });

  it("reports zero when nothing was masked", async () => {
    const server = await app();
    expect((await server.inject(reviewRequest())).json().redacted).toBe(0);
  });

  it("masks secrets in chat code, questions and earlier user messages", async () => {
    const server = await app();
    const history = [
      { role: "user", content: "my key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz" },
      { role: "assistant", content: "ok" },
    ];
    const response = await server.inject(
      chatRequest({ code: 'const token = "abcdefgh1234";', question: "is AKIAIOSFODNN7EXAMPLE safe?", history }),
    );
    expect(response.statusCode).toBe(200);
    const sent = JSON.stringify(vi.mocked(chatAboutReview).mock.calls[0]![0]);
    expect(sent).not.toMatch(/abcdefgh1234|AKIAIOSFODNN7EXAMPLE|sk-ant-api03/);
  });
});

describe("rate limiting", () => {
  it("allows requests up to the hourly limit, then returns a friendly 429", async () => {
    const server = await app({ reviewLimitPerHour: 2 });
    expect((await server.inject(reviewRequest())).statusCode).toBe(200);
    expect((await server.inject(reviewRequest())).statusCode).toBe(200);

    const blocked = await server.inject(reviewRequest());
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error).toMatch(/too many requests/i);
    expect(blocked.headers["retry-after"]).toBeDefined();
    expect(reviewCode).toHaveBeenCalledTimes(2);
  });

  it("limits chat separately from reviews", async () => {
    const server = await app({ reviewLimitPerHour: 1, chatLimitPerHour: 1 });
    expect((await server.inject(reviewRequest())).statusCode).toBe(200);
    expect((await server.inject(chatRequest())).statusCode).toBe(200);
    expect((await server.inject(chatRequest())).statusCode).toBe(429);
    expect((await server.inject(reviewRequest())).statusCode).toBe(429);
  });

  it("does not limit the health check", async () => {
    const server = await app({ reviewLimitPerHour: 1 });
    for (let i = 0; i < 5; i++) {
      expect((await server.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
    }
  });
});

describe("daily budget", () => {
  it("returns 503 once the daily limit is used up, without calling the model", async () => {
    const server = await app({ dailyRequestLimit: 2 });
    expect((await server.inject(reviewRequest())).statusCode).toBe(200);
    expect((await server.inject(chatRequest())).statusCode).toBe(200);

    const blocked = await server.inject(reviewRequest());
    expect(blocked.statusCode).toBe(503);
    expect(blocked.json().error).toMatch(/daily limit/i);
    expect(reviewCode).toHaveBeenCalledTimes(1);
  });

  it("does not spend budget on invalid requests", async () => {
    const server = await app({ dailyRequestLimit: 1 });
    expect((await server.inject(reviewRequest(""))).statusCode).toBe(400);
    expect((await server.inject(reviewRequest())).statusCode).toBe(200);
  });
});
