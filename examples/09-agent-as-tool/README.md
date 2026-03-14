# agent-as-tool

Demonstrates `agent.asTool()` — using a sub-agent as a tool for a parent agent. A translator agent is wrapped as a tool and invoked by an orchestrator agent to translate text to French.

## What it demonstrates

- `Agent.asTool()` to wrap an agent as a callable tool
- `toolName` and `toolDescription` options for the generated tool
- Parent–child agent composition via tool calling
- `Runner.run()` orchestrating multi-agent tool flows

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
