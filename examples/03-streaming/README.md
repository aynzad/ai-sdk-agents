# streaming

Demonstrates real-time streaming of agent responses and events using `Runner.stream()`. Creates an agent with a weather tool and streams text deltas, tool call events, and lifecycle events as they arrive.

## What it demonstrates

- `Runner.stream()` for streaming agent responses
- `StreamResult.events` async iterable for consuming stream events
- `StreamEvent` types (`text_delta`, `agent_start`, `agent_end`, `tool_call_start`, `tool_call_end`, `done`)
- `StreamResult.result` promise for the final `RunResult`
- Real-time console output with chalk formatting

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
