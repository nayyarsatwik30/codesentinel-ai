# CodeSentinel AI — Prototype

Autonomous repository auditor: deterministic static analysis (ESLint) finds
issues; an LLM only explains, prioritizes, and suggests a fix for issues
*already flagged* by the analyzer. The LLM never decides what counts as a
problem — that's the core design rule to defend in viva.

Stack: Next.js (frontend) · NestJS (backend API + orchestration) ·
PostgreSQL + Prisma (persistence) · ESLint/@typescript-eslint (detection) ·
Anthropic API (explanation layer) · simple-git (repo cloning).

## Architecture

```
Next.js UI  --POST /scan {repoUrl}-->  NestJS API
                                           |
                                           v
                          1. simple-git clones the repo (shallow)
                          2. EslintRunnerService lints all JS/TS files
                          3. LlmService explains + prioritizes each issue
                          4. Results persisted via Prisma -> Postgres
                                           |
Next.js UI  <--GET /scan/:id (poll)------  returns scan status + issues
```

## Setup

### 1. Backend

```bash
cd backend
cp .env.example .env     # fill in DATABASE_URL and ANTHROPIC_API_KEY
npm install
npx prisma migrate dev --name init   # creates the Scan/Issue tables
npm run dev                           # http://localhost:4000
```

You need a running Postgres instance matching `DATABASE_URL` in `.env`.
Easiest local option:

```bash
docker run --name codesentinel-pg -e POSTGRES_USER=codesentinel \
  -e POSTGRES_PASSWORD=codesentinel -e POSTGRES_DB=codesentinel \
  -p 5432:5432 -d postgres:16
```

Get an `ANTHROPIC_API_KEY` at https://console.anthropic.com/ — **without one,
the LLM layer automatically falls back to a deterministic mock explainer**
(see `src/scan/llm.service.ts`), so the pipeline still runs end-to-end and
is demo-able with zero API key configured. Add the key and every explanation
becomes a real LLM call.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:3000
```

Set `NEXT_PUBLIC_API_BASE` if the backend isn't on `localhost:4000`.

### 3. Try it

Open http://localhost:3000, paste a public GitHub repo URL (JS/TS repos
work best — the detector currently covers `.js/.jsx/.ts/.tsx/.mjs/.cjs`),
click "Scan repo". The page polls the backend every 1.5s and renders the
prioritized, LLM-explained issue list once the scan finishes.

## Standalone pipeline test (no DB, no API server)

`backend/test/pipeline-smoke-test.ts` runs just the detection + explanation
pipeline (clone → ESLint → LLM) against a repo URL *or* a local directory,
and prints the results to the console. Useful for proving the core logic
works without standing up Postgres or the full API:

```bash
cd backend
npx ts-node --transpile-only test/pipeline-smoke-test.ts https://github.com/owner/repo
# or against a local folder:
npx ts-node --transpile-only test/pipeline-smoke-test.ts /path/to/local/repo
```

## What's deliberately out of scope for the prototype

- Only ESLint-style JS/TS rules are wired up (no Semgrep/dependency-vuln
  scanning yet, despite being in the pipeline diagram) — straightforward to
  add as another detector feeding the same `RawLintIssue[]` shape.
- No auth/multi-user accounts; `Scan` rows aren't scoped to a user.
- No background job queue — the scan runs in-process after the `POST /scan`
  call returns; fine for demo-sized repos, would need a queue (BullMQ, etc.)
  for large ones.
- Severity is currently decided by the LLM per-issue; no cross-issue
  aggregate risk score yet.

## Honest scoping note for the report

The LLM explanation layer in this build was validated primarily with the
mock fallback (no live API key available in the dev sandbox at build time)
and a direct code-level test against the Anthropic Messages API; the ESLint
detection layer was validated against real flagged issues. Say this plainly
in the report rather than presenting unverified live-LLM output as tested —
consistent with the project's own "no fabricated results" rule.
