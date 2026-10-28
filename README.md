# DevCoach AI

Paste TypeScript, React or .NET (C#) code and get a structured AI code review, then ask follow-up questions about it.

Built with the Anthropic API as hands-on practice for the Claude Certified Developer: Foundations course. See [STUDY-GUIDE.md](STUDY-GUIDE.md) for 40 study questions based on this code.

## Features

- **Structured reviews:** a summary plus findings with severity, line number, explanation and recommendation. Output is constrained by a JSON schema and validated with Zod, with one retry on a malformed reply.
- **Tool use:** Claude calls a `get_language_guidelines` tool to load review rules for each language before it writes findings.
- **Follow-up chat:** ask questions about a review. The API is stateless, so the client sends history and the server trims it to the last 10 messages.
- **Secret redaction:** API keys, tokens and passwords are masked before code reaches the model. Names are kept so the model can still flag them.
- **Abuse protection:** per-IP hourly rate limits and a global daily request budget.
- **Prompt injection defenses:** code is sent as tagged user data, never in the system prompt, and is never executed.
- **Eval harness:** 19 code snippets with expected findings, scored automatically.

## Architecture

```
web (React 19, Vite, Monaco)  --/api-->  server (Fastify 5)  -->  Anthropic API
```

| Path | Purpose |
| --- | --- |
| `server/src/review.ts` | Review call, tool-use loop, validation, error mapping |
| `server/src/chat.ts` | Follow-up questions and history trimming |
| `server/src/schema.ts` | Review schema (Zod and JSON Schema) |
| `server/src/guidelines.ts` | The `get_language_guidelines` tool |
| `server/src/redact.ts` | Secret redaction |
| `server/src/app.ts` | HTTP routes, rate limiting, daily budget |
| `server/evals/` | Eval dataset, scoring and runner |
| `web/src/` | UI: editor, results, chat |

API routes: `GET /api/health`, `POST /api/review`, `POST /api/chat`.

## Getting started

Requires Node 22 or newer and an [Anthropic API key](https://platform.claude.com).

```bash
git clone https://github.com/artrit10/dev-coach-ai.git
cd dev-coach-ai
nvm use            # reads .nvmrc, optional
npm install
cp .env.example .env   # then set ANTHROPIC_API_KEY
npm run dev
```

The web app runs at http://localhost:5173 and proxies `/api` to the server on port 3001.

`npm run dev` starts both processes in the background of one shell, so Ctrl+C can leave the server running. If port 3001 stays busy, run `pkill -f "tsx watch"`. Alternatively run `npm run dev:server` and `npm run dev:web` in two terminals.

## Configuration

Set in `.env` at the project root. Restart the server after changes.

| Variable | Default | Description |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | none | Required |
| `PORT` | `3001` | Server port |
| `LOG_PROMPTS` | `false` | Log the redacted messages sent to Claude (debugging only) |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy so rate limits use the real client IP |
| `REVIEW_LIMIT_PER_HOUR` | `10` | Reviews per IP per hour |
| `CHAT_LIMIT_PER_HOUR` | `40` | Chat messages per IP per hour |
| `DAILY_REQUEST_LIMIT` | `300` | Total requests per day across all users |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start server and web app |
| `npm run build` | Type-check both workspaces and build the web app |
| `npm test --workspace server` | Run the unit tests (no API calls, no cost) |
| `npm run eval` | Run the eval set against the live API (costs tokens) |

### Evals

```bash
npm run eval                                  # all cases, current prompt
npm run eval -- --runs 3                      # repeat each case to measure stability
npm run eval -- --prompt current,basic        # compare prompt versions
npm run eval -- --case ts-sql-injection       # one case
```

Each case checks that expected findings appear (by keyword and minimum severity), that clean code gets no real findings, and that injected instructions in the code are not followed. Results are written to `server/evals/results/` (gitignored).

## Privacy and security

- Submitted code is sent to the Anthropic API to produce the review. It is not stored by this app.
- With `LOG_PROMPTS=true` the server logs redacted code to its console. Keep it off in production.
- Redaction is pattern based and best effort. Do not paste real credentials.
- Rate limits and the daily budget are in memory, so they reset on restart and are per instance.
- Reviews are AI recommendations, not verified bugs.

## Known limitations

- Line numbers are occasionally off by one.
- The eval set is small and fairly easy.
- Chat history is supplied by the client and trusted by the server.
- Monaco is loaded from a CDN by default.
- Not yet deployed.
