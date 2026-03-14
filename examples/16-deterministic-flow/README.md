# 16 — Deterministic Flow

Deterministic pipeline that chains agents with `outputSchema`, using sequential `Runner.run()` calls. Each stage produces structured output that feeds into the next stage as context.

## Pipeline

1. **Research Agent** — Gathers facts about a topic, returns structured `{ facts, topic, confidence }`
2. **Quality Check Agent** — Validates research quality, returns `{ approved, issues, score }`
3. **Writer Agent** — If approved, produces final prose text from the validated research

## Run

```bash
pnpm install
pnpm start
```

## Test

```bash
pnpm test
```
