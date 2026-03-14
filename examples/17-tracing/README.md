# 17 - Tracing

Demonstrates the built-in tracing system using `consoleTraceProcessor`, `memoryTraceProcessor`, and the `trace()` utility.

## What it shows

- Attaching trace processors via `RunConfig.tracing.processors`
- `consoleTraceProcessor` — logs trace lifecycle events to the console
- `memoryTraceProcessor` — collects `TraceSpan` objects in memory for inspection
- Retrieving and iterating collected spans after a run

## Run

```bash
pnpm start
```

## Test

```bash
pnpm test
```
