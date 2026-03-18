# nextjs-multi-agent

A multi-agent customer service chat application where specialist agents collaborate. Built with Next.js App Router, ai-sdk-agents handoffs, and the AI SDK `useChat` hook.

## What it demonstrates

- Multi-agent with `handoff()` on the server (triage → FAQ / booking agents)
- Tool usage: FAQ lookup, seat info, seat changes
- Streaming tool call results to the client
- `isToolUIPart` for rendering tool invocations in the UI
- Suggestion chips for quick-start interactions
- `stepCountIs` for multi-step tool calls

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

Open [http://localhost:3022](http://localhost:3022) in your browser.

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
