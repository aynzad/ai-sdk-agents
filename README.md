<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/public/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="docs/public/logo-light.svg">
    <img alt="AI SDK Agents" src="docs/public/logo-light.svg" width="300">
  </picture>
</p>

<p align="center">
  Multi-agent orchestration for <a href="https://ai-sdk.dev">Vercel AI SDK</a> — handoffs, guardrails, and tracing.
</p>

The missing middle between raw AI SDK and full agent frameworks.

```bash
pnpm add ai-sdk-agents ai zod
```

> **[Full Documentation](https://github.com/aynzad/ai-sdk-agents#readme)** · **[Examples](./examples/)** · **[API Reference](./docs/)**

## Why?

Vercel AI SDK gives you powerful primitives (`generateText`, `streamText`, `tool()`). OpenAI's Agents SDK gives you multi-agent orchestration. **ai-sdk-agents** bridges the gap — adding handoffs, guardrails, and tracing on top of AI SDK without locking you into a framework.

- **Zero runtime dependencies** — just `ai` and `zod` as peer deps
- **~2000 lines of source** — thin orchestration layer, not a framework
- **Any provider** — works with OpenAI, Anthropic, Google, or any AI SDK provider
- **Incremental adoption** — add to existing AI SDK code in minutes

## Quick Start

```typescript
import { tool } from "ai";
import { z } from "zod";
import { Agent, Runner } from "ai-sdk-agents";
import { google } from "@ai-sdk/google";

const getWeather = tool({
  description: "Get the weather for a city",
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => `72°F and sunny in ${city}`,
});

const agent = new Agent({
  name: "Assistant",
  model: google("gemini-2.5-flash"),
  instructions: "You are a helpful assistant.",
  tools: { getWeather },
});

const result = await Runner.run(agent, "What is the weather in Berlin?");
console.log(result.output);
```

## Multi-Agent Handoffs

Handoffs transfer full conversation control from one agent to another — the receiving agent gets the message history and takes over completely.

```typescript
import { Agent, Runner, handoff } from "ai-sdk-agents";

const spanishAgent = new Agent({
  name: "Spanish Agent",
  instructions: "You always respond in Spanish.",
  model,
});

const triageAgent = new Agent({
  name: "Triage Agent",
  instructions:
    "If the user writes in Spanish, hand off to the Spanish Agent. Otherwise respond in English.",
  model,
  handoffs: [handoff(spanishAgent)],
});

const result = await Runner.run(triageAgent, "Hola, necesito ayuda");
// result.agent → "Spanish Agent" (handoff occurred)
```

Use `handoffFilters` to control which messages the receiving agent sees:

```typescript
import { handoff, handoffFilters } from "ai-sdk-agents";

handoff(agent, {
  inputFilter: handoffFilters.compose(
    handoffFilters.removeToolMessages,
    handoffFilters.keepLast(5),
  ),
});
```

## Guardrails

Guardrails validate inputs and outputs with tripwire-based halting. When a guardrail trips, execution stops immediately with a `GuardrailTripwiredError`.

```typescript
import { Agent, guardrail, GuardrailTripwiredError } from "ai-sdk-agents";

const noInjection = guardrail({
  name: "no-injection",
  execute: (_ctx, input) => {
    const text = input.messages.map((m) =>
      typeof m.content === "string" ? m.content : ""
    ).join(" ");
    return {
      tripwired: text.toLowerCase().includes("ignore all previous"),
      reason: "Potential prompt injection detected",
    };
  },
});

const agent = new Agent({
  name: "Guarded Agent",
  model,
  instructions: "You are a helpful assistant.",
  inputGuardrails: [noInjection],
  outputGuardrails: [/* output guardrails here */],
});
```

Built-in shortcuts: `llmGuardrail()`, `keywordGuardrail()`, `maxLengthGuardrail()`, `regexGuardrail()`.

Tool-level guardrails are also available via `guardedTool()`, `defineToolInputGuardrail()`, and `defineToolOutputGuardrail()`.

## Agent-as-a-Tool

Use one agent as a tool inside another. The sub-agent runs to completion and returns its output as a tool result.

```typescript
const translator = new Agent({
  name: "Translator",
  instructions: "Translate the given text to French.",
  model,
});

const orchestrator = new Agent({
  name: "Orchestrator",
  instructions: "Use the translate tool to perform translations.",
  model,
  tools: {
    translate: translator.asTool({
      toolName: "translate",
      toolDescription: "Translate text to French",
    }),
  },
});
```

## Context & Dependency Injection

Pass typed context to agents and access it in dynamic instructions, tools, guardrails, and hooks.

```typescript
interface UserPrefs {
  language: string;
  expertiseLevel: "beginner" | "intermediate" | "expert";
}

const agent = new Agent<UserPrefs>({
  name: "Adaptive Assistant",
  model,
  instructions: (ctx) => {
    const { language, expertiseLevel } = ctx.context;
    return `Respond in ${language}. User level: ${expertiseLevel}.`;
  },
});

const result = await Runner.run(agent, "Explain REST APIs", {
  context: { language: "English", expertiseLevel: "beginner" },
});
```

## Streaming

Stream responses in real-time with typed events for text deltas, tool calls, agent transitions, and completion.

```typescript
const streamResult = Runner.stream(agent, "Explain what makes the ocean blue.");

for await (const event of streamResult.events) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
}

const result = await streamResult.result;
```

## Lifecycle Hooks

Two levels of hooks for observability and control:

- **Agent hooks** (`hooks` on `Agent`) — `onStart`, `onEnd`, `onToolCall`, `onToolResult`
- **Run hooks** (`hooks` on `RunConfig`) — `onRunStart`, `onRunEnd`, `onAgentStart`, `onAgentEnd`

```typescript
const agent = new Agent({
  name: "Agent",
  model,
  instructions: "...",
  hooks: {
    onStart: (ctx) => console.log(`Agent started, turn ${ctx.turn}`),
    onToolCall: (ctx, toolName, args) => console.log(`Tool: ${toolName}`),
  },
});

await Runner.run(agent, "Hello", {
  hooks: {
    onRunStart: (ctx) => console.log("Run started"),
    onRunEnd: (_ctx, result) => console.log(`Done: ${result.output}`),
  },
});
```

## Tracing

Every run automatically captures traces with spans for agents, LLM calls, tool executions, guardrails, and handoffs.

```typescript
import { Runner, consoleTraceProcessor, memoryTraceProcessor } from "ai-sdk-agents";

const memory = memoryTraceProcessor();

const result = await Runner.run(agent, "What's the weather?", {
  tracing: { processors: [consoleTraceProcessor(), memory] },
});

const traces = memory.getTraces();
```

Use `addTraceProcessor()` for global processors, or pass them per-run via `RunConfig.tracing`.

## Examples

22 runnable examples covering every feature:

| # | Example | Feature |
|---|---------|---------|
| 01 | [Hello World](./examples/01-hello-world/) | Minimal agent |
| 02 | [Agent with Tools](./examples/02-agent-with-tools/) | Tool integration |
| 03 | [Streaming](./examples/03-streaming/) | Real-time streaming |
| 04 | [Structured Output](./examples/04-structured-output/) | Zod output schemas |
| 05 | [Dynamic Instructions](./examples/05-dynamic-instructions/) | Context-driven instructions |
| 06 | [Lifecycle Hooks](./examples/06-lifecycle-hooks/) | Agent + run hooks |
| 07 | [Agent Handoff](./examples/07-agent-handoff/) | Handoff between agents |
| 08 | [Handoff with Filters](./examples/08-handoff-with-filters/) | Message filtering on handoff |
| 09 | [Agent as Tool](./examples/09-agent-as-tool/) | Sub-agent as tool |
| 10 | [Input/Output Guardrails](./examples/10-input-output-guardrails/) | Input & output validation |
| 11 | [Tool Guardrails](./examples/11-tool-guardrails/) | Tool-level guardrails |
| 12 | [LLM Guardrail](./examples/12-llm-guardrail/) | LLM-as-judge guardrail |
| 13 | [Keyword Guardrail](./examples/13-keyword-guardrail/) | Built-in guardrail helpers |
| 14 | [Parallel Agents](./examples/14-parallel-agents/) | Concurrent agent runs |
| 15 | [Agent Routing](./examples/15-agent-routing/) | Triage with multiple handoffs |
| 16 | [Deterministic Flow](./examples/16-deterministic-flow/) | Sequential pipeline |
| 17 | [Tracing](./examples/17-tracing/) | Trace processors |
| 18 | [Customer Service Bot](./examples/18-customer-service-bot/) | Multi-agent interactive bot |
| 19 | [Research Bot](./examples/19-research-bot/) | Parallel research pipeline |
| 20 | [Next.js Chat](./examples/20-nextjs-chat/) | Next.js chat UI |
| 21 | [Next.js Multi-Agent](./examples/21-nextjs-multi-agent/) | Next.js multi-agent chat |
| 22 | [Next.js Human-in-the-Loop](./examples/22-nextjs-human-in-the-loop/) | Tool approval flow |

Run any example:

```bash
pnpm examples:dev 1   # runs example 01
pnpm examples:dev 7   # runs example 07
```

## API Reference

### Classes

| Export | Description |
|--------|-------------|
| `Agent` | Declarative agent definition with name, model, instructions, tools, handoffs, and guardrails. |
| `Runner` | Orchestration engine. `Runner.run()` for completion, `Runner.stream()` for streaming. |
| `Trace` | Trace context for grouping related runs and spans. |

### Functions — Handoffs

| Export | Description |
|--------|-------------|
| `handoff(agent, options?)` | Create a configured handoff with custom tool name, description, callbacks, and input filters. |
| `handoffFilters` | Built-in message filters: `removeToolMessages`, `keepLast(n)`, `compose(…)`. |

### Functions — Guardrails

| Export | Description |
|--------|-------------|
| `guardrail({ name, execute })` | Create a custom input/output guardrail. |
| `llmGuardrail(config)` | LLM-as-judge guardrail that uses a model to evaluate inputs/outputs. |
| `keywordGuardrail(keywords)` | Trip on keyword matches. |
| `maxLengthGuardrail(max)` | Trip when content exceeds length. |
| `regexGuardrail(pattern)` | Trip on regex matches. |

### Functions — Tool Guardrails

| Export | Description |
|--------|-------------|
| `guardedTool(tool, guardrails)` | Wrap a tool with input/output guardrails. |
| `defineToolInputGuardrail(config)` | Define a tool input guardrail. |
| `defineToolOutputGuardrail(config)` | Define a tool output guardrail. |
| `ToolGuardrailBehaviorFactory` | Factory for built-in behaviors (`block`, `allow`, `transform`). |
| `isGuardedTool(tool)` | Type guard to check if a tool has guardrails. |

### Functions — Tracing

| Export | Description |
|--------|-------------|
| `trace(name, fn, config?)` | Create a trace context for grouping related runs. |
| `addTraceProcessor(processor)` | Register a global trace processor. |
| `removeTraceProcessor(processor)` | Remove a global trace processor. |
| `clearTraceProcessors()` | Remove all global trace processors. |
| `consoleTraceProcessor()` | Built-in processor that logs spans to console. |
| `memoryTraceProcessor()` | Built-in processor that collects spans in memory. |

### Error Classes

| Export | Description |
|--------|-------------|
| `GuardrailTripwiredError` | Thrown when an input/output guardrail trips. |
| `ToolGuardrailTripwiredError` | Thrown when a tool guardrail trips. |
| `MaxTurnsExceededError` | Thrown when the runner exceeds the maximum turn limit. |
| `HandoffError` | Thrown on handoff failures. |

### Test Utilities

Import from `ai-sdk-agents/test` for mocked models and result builders — no API keys needed in tests.

## License

MIT
