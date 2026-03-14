# structured-output

Shows how to constrain agent output to a specific schema using Zod. The agent returns a structured movie recommendation with typed fields instead of free-form text.

## What it demonstrates

- `Agent` with `outputSchema` (Zod object)
- Typed `RunResult.output` matching the schema
- Schema validation of LLM output
- Type safety in TypeScript

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
