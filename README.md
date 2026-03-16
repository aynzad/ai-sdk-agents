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

> **[📚 Full Documentation](https://aynzad.github.io/ai-sdk-agents/)** 

> **[🤖 Examples](#examples)**

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
| 22 | [Next.js Human-in-the-Loop](./examples/22-nextjs-human-in-the-loop/) | Client-side tools with Runner.streamUI() |

## Local Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) (v10+)

### Installation

```bash
pnpm add ai-sdk-agents ai zod
```

### Development

Clone the repo and install dependencies:

```bash
git clone https://github.com/aynzad/ai-sdk-agents.git
cd ai-sdk-agents
pnpm install
```

Build the library:

```bash
pnpm build
```

### Running Examples

Install all example dependencies (builds the library first):

```bash
pnpm examples:install
```

Run any example by number:

```bash
pnpm examples:dev 1   # runs example 01
pnpm examples:dev 7   # runs example 07
```

### Testing

Run the library tests:

```bash
pnpm test
```

Run example tests:

```bash
pnpm examples:test
```

Run all tests together:

```bash
pnpm test-all
```

### Code Quality

```bash
pnpm lint          # lint source
pnpm format        # format source
pnpm type-check    # type-check source
pnpm check-all     # run all checks (format, lint, type-check, examples)
```

## License

MIT
