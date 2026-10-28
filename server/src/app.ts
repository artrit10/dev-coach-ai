import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { z } from "zod";
import { createDailyBudget } from "./budget.js";
import { chatAboutReview, type ChatMessage } from "./chat.js";
import { ReviewError, reviewCode } from "./review.js";
import { redactSecrets } from "./redact.js";
import { reviewSchema } from "./schema.js";

const MAX_CODE_CHARS = 20_000;

const reviewBody = z.object({
  code: z.string().trim().min(1, "Paste some code first.").max(MAX_CODE_CHARS, `Code must be at most ${MAX_CODE_CHARS} characters.`),
  language: z.enum(["typescript", "react", "dotnet"]).optional(),
});

const MAX_QUESTION_CHARS = 1_000;
const MAX_HISTORY_ITEMS = 20;
const MAX_HISTORY_CHARS = 6_000;

const chatBody = z.object({
  code: z.string().trim().min(1).max(MAX_CODE_CHARS),
  review: reviewSchema,
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(MAX_HISTORY_CHARS),
      }),
    )
    .max(MAX_HISTORY_ITEMS)
    .refine(
      (history) => history.every((m, i) => m.role === (i % 2 === 0 ? "user" : "assistant")) && history.length % 2 === 0,
      "History must alternate user and assistant messages in complete pairs.",
    ),
  question: z.string().trim().min(1, "Type a question first.").max(MAX_QUESTION_CHARS, `Questions must be at most ${MAX_QUESTION_CHARS} characters.`),
});

export type AppOptions = {
  reviewLimitPerHour?: number;
  chatLimitPerHour?: number;
  dailyRequestLimit?: number;
};

const envNumber = (name: string, fallback: number) => Number(process.env[name] ?? fallback);

const DAILY_LIMIT_MESSAGE = "The demo has reached its daily limit. Please try again tomorrow.";

export async function buildApp(options: AppOptions = {}) {
  const reviewLimit = options.reviewLimitPerHour ?? envNumber("REVIEW_LIMIT_PER_HOUR", 10);
  const chatLimit = options.chatLimitPerHour ?? envNumber("CHAT_LIMIT_PER_HOUR", 40);
  const budget = createDailyBudget(options.dailyRequestLimit ?? envNumber("DAILY_REQUEST_LIMIT", 300));

  const app = Fastify({
    logger: true,
    bodyLimit: 100_000,
    // Behind a proxy (Render, Railway) the real visitor IP is in X-Forwarded-For. Only trust it there.
    trustProxy: process.env.TRUST_PROXY === "true",
  });

  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: `You have made too many requests. Please try again in ${context.after}.`,
    }),
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.post(
    "/api/review",
    { config: { rateLimit: { max: reviewLimit, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const parsed = reviewBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
      }
      if (!budget.take()) return reply.code(503).send({ error: DAILY_LIMIT_MESSAGE });

      // Likely credentials are masked before anything leaves this server.
      const { text: code, count: redacted } = redactSecrets(parsed.data.code);

      try {
        const review = await reviewCode({ ...parsed.data, code });
        return { review, redacted };
      } catch (error) {
        const err = error instanceof ReviewError ? error : new ReviewError("Unexpected error.", 500);
        request.log.error({ err: error }, "review failed");
        return reply.code(err.statusCode).send({ error: err.message });
      }
    },
  );

  app.post(
    "/api/chat",
    { bodyLimit: 300_000, config: { rateLimit: { max: chatLimit, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const parsed = chatBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
      }
      if (!budget.take()) return reply.code(503).send({ error: DAILY_LIMIT_MESSAGE });

      const history: ChatMessage[] = parsed.data.history.map((m) => ({ ...m, content: redactSecrets(m.content).text }));

      try {
        const answer = await chatAboutReview({
          ...parsed.data,
          code: redactSecrets(parsed.data.code).text,
          question: redactSecrets(parsed.data.question).text,
          history,
        });
        return { answer };
      } catch (error) {
        const err = error instanceof ReviewError ? error : new ReviewError("Unexpected error.", 500);
        request.log.error({ err: error }, "chat failed");
        return reply.code(err.statusCode).send({ error: err.message });
      }
    },
  );

  return app;
}
