# hello-world

The simplest possible `ai-sdk-agents` example. Creates a single agent with a name, model, and system instructions, then uses `Runner.run()` to send a prompt and print the result.

## What it demonstrates

- `Agent` creation with name, model, and instructions
- `Runner.run()` to execute the agent
- `RunResult` with `.output` and `.usage`

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
