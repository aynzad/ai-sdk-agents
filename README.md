# ai-sdk-agents

Multi-agent orchestration for [Vercel AI SDK](https://ai-sdk.dev) — handoffs, guardrails, and tracing.

The missing middle between raw AI SDK and full agent frameworks.

```bash
pnpm add ai-sdk-agents ai zod
```

## Why?

Vercel AI SDK gives you powerful primitives (`generateText`, `streamText`, `tool()`). OpenAI's Agents SDK gives you multi-agent orchestration. **ai-sdk-agents** bridges the gap — adding handoffs, guardrails, and tracing on top of AI SDK without locking you into a framework.

- **Zero runtime dependencies** — just `ai` and `zod` as peer deps
- **~15KB bundle** — thin orchestration layer, not a framework
- **Any provider** — works with OpenAI, Anthropic, Google, or any AI SDK provider
- **Incremental adoption** — add to existing AI SDK code in minutes

## Quick Start

```typescript
import { Agent, Runner } from "ai-sdk-agents";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const agent = new Agent({
  name: "Assistant",
  model: anthropic("claude-sonnet-4-5-20250929"),
  instructions: "You are a helpful assistant.",
  tools: {
    weather: {
      description: "Get the weather for a city",
      parameters: z.object({ city: z.string() }),
      execute: async ({ city }) => `72°F and sunny in ${city}`,
    },
  },
});

const result = await Runner.run(agent, "What is the weather in Berlin?");
console.log(result.output);
```

## Multi-Agent Handoffs

Handoffs transfer full conversation control from one agent to another — the receiving agent gets the message history and takes over completely.

## Guardrails

Guardrails validate inputs and outputs with tripwire-based halting. When a guardrail trips, execution stops immediately.

## Agent-as-a-Tool

## Context & Dependency Injection

## Tracing

Every run automatically captures traces with spans for agents, LLM calls, tool executions, guardrails, and handoffs.

## Streaming

## Lifecycle Hooks

## API Reference

### `Agent`

Declarative agent definition with name, model, instructions, tools, handoffs, and guardrails.

### `Runner.run(agent, input, config?)`

Execute an agent to completion. Returns `RunResult` with output, steps, usage, and trace ID.

### `Runner.stream(agent, input, config?)`

Execute an agent with streaming. Returns `StreamResult` with async event iterator.

### `handoff(agent, options?)`

Create a configured handoff with custom tool name, description, callbacks, and input filters.

### `guardrail({ name, execute })`

Create a custom guardrail. `llmGuardrail()`, `keywordGuardrail()`, `maxLengthGuardrail()`, `regexGuardrail()` are built-in shortcuts.

### `trace(name, fn, config?)`

Create a trace context for grouping related runs.

## License

MIT
