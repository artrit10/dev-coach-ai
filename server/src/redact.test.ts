import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redact.js";

describe("redactSecrets", () => {
  it.each([
    ["an Anthropic key", "const k = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';", "sk-ant-"],
    ["an OpenAI key", "const k = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD';", "sk-proj-"],
    ["an AWS access key", "aws_id = AKIAIOSFODNN7EXAMPLE", "AKIAIOSFODNN7EXAMPLE"],
    ["a GitHub token", "token ghp_abcdefghijklmnopqrstuvwxyz0123456789", "ghp_abc"],
    ["a Slack token", "xoxb-123456789012-abcdefghijkl", "xoxb-1234"],
    ["a Google API key", "AIzaSyA1234567890abcdefghijklmnopqrstuv", "AIzaSyA"],
    ["a Stripe live key", `sk_${"live"}_${"x".repeat(24)}`, "sk_live_xxxx"],
    ["a JWT", "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop", "eyJhbGci"],
    ["a database password in a URL", "postgres://admin:s3cr3tpass@db.example.com/app", "s3cr3tpass"],
  ])("masks %s", (_name, input, leaked) => {
    const { text, count } = redactSecrets(input);
    expect(count).toBe(1);
    expect(text).toMatch(/REDACTED/);
    expect(text).not.toContain(leaked);
  });

  it("masks secret-looking assignments but keeps the name so the AI can still flag them", () => {
    const { text, count } = redactSecrets('const password = "hunter2";');
    expect(count).toBe(1);
    expect(text).toBe('const password = "[REDACTED_SECRET]";');
  });

  it.each([
    ['C# field', 'private string apiKey = "abcd1234efgh";', "abcd1234efgh"],
    ["JSON property", '{ "client_secret": "xyz-987654" }', "xyz-987654"],
    ["object literal", "const cfg = { authToken: 'tok_12345678' };", "tok_12345678"],
    ["single quotes", "DB_PASSWORD = 'correct horse'", "correct horse"],
  ])("masks a secret in a %s", (_name, input, leaked) => {
    const { text, count } = redactSecrets(input);
    expect(count).toBe(1);
    expect(text).not.toContain(leaked);
  });

  it("masks a private key block and keeps the line count", () => {
    const input = ["a", "-----BEGIN RSA PRIVATE KEY-----", "MIIBOgIBAAJBAK", "abcdef", "-----END RSA PRIVATE KEY-----", "b"].join("\n");
    const { text, count } = redactSecrets(input);
    expect(count).toBe(1);
    expect(text).not.toContain("MIIBOg");
    expect(text.split("\n")).toHaveLength(input.split("\n").length);
    expect(text.split("\n")[0]).toBe("a");
    expect(text.split("\n").at(-1)).toBe("b");
  });

  it("never changes the number of lines", () => {
    const input = 'const a = 1;\nconst token = "abcdefgh1234";\nconst b = 2;\n';
    expect(redactSecrets(input).text.split("\n")).toHaveLength(input.split("\n").length);
  });

  it("counts every secret", () => {
    const input = 'const a = "AKIAIOSFODNN7EXAMPLE";\nconst password = "hunter22";';
    expect(redactSecrets(input).count).toBe(2);
  });

  it("is idempotent", () => {
    const once = redactSecrets('const password = "hunter22"; // sk-ant-api03-abcdefghijklmnopqrstuvwxyz').text;
    const twice = redactSecrets(once);
    expect(twice.text).toBe(once);
    expect(twice.count).toBe(0);
  });

  it.each([
    "const token = getToken();",
    "const secretKey = process.env.SECRET_KEY;",
    "password: string;",
    'const passwordField = document.getElementById("pw");',
    'const label = "Enter your password";',
    "const t = tokens.length;",
    'const short = { token: "abc" };',
    "function hashPassword(password: string) { return bcrypt.hash(password, 10); }",
    "const url = 'https://example.com/api/users';",
  ])("leaves ordinary code alone: %s", (input) => {
    expect(redactSecrets(input)).toEqual({ text: input, count: 0 });
  });
});
