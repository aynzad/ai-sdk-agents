# nextjs-guardrails

A chat interface with input and output guardrails powered by ai-sdk-agents. Demonstrates how guardrails block harmful inputs and sensitive outputs in a web UI.

## What it demonstrates

- `guardrail()` — custom input guardrail blocking prompt injection
- `keywordGuardrail()` — built-in helper blocking dangerous keywords (hack, exploit, etc.)
- `regexGuardrail()` — output guardrails blocking credit card and SSN patterns
- `Agent` with `inputGuardrails` and `outputGuardrails`
- `GuardrailTripwiredError` surfaced as error UI in the chat
- `Runner.stream()` bridged to `useChat` via `createUIMessageStream`

## Setup

```bash
pnpm install
cp .env.example .env
# Fill in at least one provider API key in .env
```

## Run

```bash
pnpm dev
```

Open [http://localhost:3023](http://localhost:3023) in your browser.

## Test

Unit tests (mocked LLM, no API key needed):

```bash
pnpm test
```

E2E tests (Playwright):

```bash
pnpm test:e2e
```

## Lint & Format

```bash
pnpm lint
pnpm format
```
