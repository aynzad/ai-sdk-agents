# nextjs-guardrails

A chat interface with agent-level and tool-level guardrails powered by ai-sdk-agents. Demonstrates how guardrails block harmful inputs, sensitive outputs, and dangerous tool invocations in a web UI.

## What it demonstrates

### Agent-level guardrails
- `guardrail()` — custom input guardrail blocking prompt injection
- `keywordGuardrail()` — built-in helper blocking dangerous keywords (hack, exploit, etc.)
- `regexGuardrail()` — output guardrails blocking credit card and SSN patterns
- `Agent` with `inputGuardrails` and `outputGuardrails`
- `GuardrailTripwiredError` surfaced as error UI in the chat

### Tool-level guardrails
- `guardedTool()` — wraps a tool with input and output guardrails
- `defineToolInputGuardrail()` — blocks SQL injection in tool arguments
- `defineToolOutputGuardrail()` — redacts PII from tool results
- `ToolGuardrailBehaviorFactory` — `allow()`, `rejectContent()`, `throwException()`
- `ToolGuardrailTripwiredError` surfaced as error UI in the chat

### Streaming
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
