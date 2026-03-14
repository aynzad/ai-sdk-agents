# dynamic-instructions

Demonstrates dynamic instructions that change based on runtime context. The agent adapts its response style based on user preferences injected via `RunConfig.context`.

## What it demonstrates

- `Agent` with `instructions` as an async function
- `RunContext<TContext>` with a custom context type
- `RunConfig.context` for dependency injection
- Different contexts producing different instruction prompts

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
