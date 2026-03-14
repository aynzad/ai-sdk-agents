# agent-with-tools

Demonstrates how to give an `ai-sdk-agents` agent custom tools and have it call them during a conversation. The agent has two tools — a weather lookup and a time zone lookup — both defined with Zod schemas.

## What it demonstrates

- `Agent` with `tools` (AI SDK `tool()` with Zod schemas)
- `Runner.run()` with automatic tool execution
- `RunResult.steps` (inspecting tool calls and results)

## Setup

```bash
pnpm install
cp .env.example .env
# Fill in at least one provider API key in .env
```

## Run

```bash
pnpm start
```

## Test

Tests use mocked LLM responses (no API key needed):

```bash
pnpm test
```

## Lint & Format

```bash
pnpm lint
pnpm format
```
