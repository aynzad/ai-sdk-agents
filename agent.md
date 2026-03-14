## Project Identity

**Name:** ai-sdk-agents
**Tagline:** Multi-agent orchestration for Vercel AI SDK — handoffs, guardrails, and tracing.
**Position:** The missing middle between raw AI SDK and full agent frameworks like Mastra.

## What This Is

A thin (~800-1200 lines), zero-runtime-dependency TypeScript library that adds multi-agent orchestration on top of Vercel AI SDK's existing primitives (`generateText`, `streamText`, `tool()`). It does NOT replace AI SDK — it composes on top of it.

## What This Is NOT

- Not a framework (no opinions on routing, deployment, or persistence)
- Not a RAG pipeline
- Not a workflow engine
- Not a memory system
- Not an alternative to AI SDK — it's an extension

## Core Principles

1. **Compose, don't replace.** Every feature delegates to AI SDK under the hood. Users keep their existing `generateText`/`streamText` code.
2. **Zero runtime dependencies.** Only `ai` and `zod` as peer deps. Nothing else ships.
3. **Type-safe by default.** Generic context types flow through agents, tools, guardrails, and hooks.
4. **Eject cleanly.** If a user outgrows this library, they can replace any piece with raw AI SDK calls.
5. **Small API surface.** Five exports cover everything: `Agent`, `handoff`, `guardrail`, `Runner`, `trace`.

---

## AI SDK Version

This library targets **Vercel AI SDK 6** (`ai@^6.0.0`). Key APIs used from the SDK:

- `generateText`, `streamText`, `stepCountIs` — core generation and step control
- `LanguageModel` — version-agnostic model type (accepts V2, V3, and string gateway IDs)
- `ModelMessage` — message type (replaces the removed `CoreMessage` from v4)
- `Tool`, `ToolSet`, `ToolExecutionOptions` — tool definitions
- `LanguageModelUsage` — token usage tracking

Provider packages (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`) are at `^3.0.0`.

---

## Tech Stack

- **Runtime:** Node.js >= 18
- **Language:** TypeScript
- **AI SDK:** `ai` >= 6.0.0 (Vercel AI SDK 6)
- **Build:** Vite lib mode (dual CJS/ESM via Rollup)
- **Types:** vite-plugin-dts (bundled .d.ts)
- **Testing:** Vitest
- **Linting:** ESLint + @typescript-eslint
- **Formatting:** Prettier
- **Docs:** Astro Starlight + TypeDoc (auto-generated API reference)
- **Releases:** Changesets
- **CI:** GitHub Actions
- **Peer deps:** `ai` >= 6.0.0, `zod` >= 3.25.76

---

## Workspace Structure

This is a pnpm workspace monorepo with three packages:

```
pnpm-workspace.yaml
├── "."              # Root — the ai-sdk-agents library
├── "docs"           # Astro Starlight documentation site
└── "examples/*"     # Runnable example projects
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                   User Code                      │
│  const result = await Runner.run(agent, input)   │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│                   Runner                         │
│  Orchestration loop: invoke → check → route      │
│  Manages turns, handoffs, guardrails, tracing    │
└──┬──────────┬──────────┬──────────┬─────────────┘
   │          │          │          │
┌──▼──┐  ┌───▼───┐  ┌───▼────┐  ┌─▼──────┐
│Agent│  │Handoff│  │Guardrail│  │Tracing │
│     │  │       │  │        │  │        │
│config│ │transfer│ │validate │  │spans   │
│tools │ │filter  │ │tripwire │  │process │
│hooks │ │callback│ │halt     │  │export  │
└──┬──┘  └───────┘  └────────┘  └────────┘
   │
┌──▼──────────────────────────────────────────────┐
│              Vercel AI SDK 6                     │
│  generateText() / streamText() / tool()          │
│  Any provider: OpenAI, Anthropic, Google, etc.   │
└─────────────────────────────────────────────────┘
```

---

## Package Scripts

### Library (root)

| Script           | Command                                                 | Purpose                         |
| ---------------- | ------------------------------------------------------- | ------------------------------- |
| `build`          | `vite build`                                            | Production build (dual CJS/ESM) |
| `build:types`    | `vite build && tsc --emitDeclarationOnly --outDir dist` | Build + emit declaration files  |
| `dev`            | `vite build --watch`                                    | Rebuild on file changes         |
| `test`           | `vitest run`                                            | Run tests once                  |
| `test:watch`     | `vitest`                                                | Run tests in watch mode         |
| `test:coverage`  | `vitest run --coverage`                                 | Run tests with coverage report  |
| `lint`           | `eslint src/`                                           | Lint source files               |
| `lint:fix`       | `eslint src/ --fix`                                     | Lint and auto-fix               |
| `format`         | `prettier --write "src/**/*.ts"`                        | Format all source files         |
| `type-check`     | `tsc --noEmit`                                          | Type-check without emitting     |
| `prepublishOnly` | `pnpm run build`                                        | Auto-build before publish       |
| `changeset`      | `changeset`                                             | Create a new changeset          |
| `release`        | `changeset publish`                                     | Publish via changesets          |
| `build:ci`       | `pnpm run build`                                        | CI build alias                  |

### Examples

| Script               | Command                             | Purpose                                |
| -------------------- | ----------------------------------- | -------------------------------------- |
| `examples:dev`       | `bash scripts/examples-dev.sh`      | Run an example (e.g. `pnpm examples:dev 1`)  |
| `examples:test`      | `bash scripts/examples-test.sh`     | Run example tests                      |
| `examples:lint`      | `bash scripts/examples-lint.sh`     | Lint example source files              |
| `examples:format`    | `bash scripts/examples-format.sh`   | Format example source files            |
| `examples:type-check`| `bash scripts/examples-type-check.sh` | Type-check example projects          |

### Docs (Astro Starlight)

| Script               | Command                              | Purpose                            |
| -------------------- | ------------------------------------ | ---------------------------------- |
| `docs:dev`           | `pnpm --filter docs dev`            | Start docs dev server              |
| `docs:build`         | `pnpm --filter docs build`          | Build docs for production          |
| `docs:scripts:check` | `pnpm --filter docs astro check`    | Type-check Astro/MDX content       |

### Aggregate

| Script       | Command                                                                  | Purpose                           |
| ------------ | ------------------------------------------------------------------------ | --------------------------------- |
| `check-all`  | `format + type-check + lint + docs check + examples format/lint/type-check` | Run all checks across workspace   |
| `test-all`   | `pnpm run test && pnpm run examples:test`                                | Run all tests (lib + examples)    |

---

## Project File Map

```
ai-sdk-agents/
├── src/                          # Library source code
│   ├── types.ts                  # All shared types, interfaces, and error classes
│   ├── index.ts                  # Public API barrel export
│   ├── agent/
│   │   └── agent.ts              # Agent class (declarative config, asTool, clone)
│   ├── handoff/
│   │   └── handoff.ts            # handoff(), handoffToTool(), handoffFilters, helpers
│   ├── guardrail/
│   │   ├── guardrail.ts          # guardrail(), llmGuardrail(), built-ins
│   │   └── tool-guardrail.ts     # guardedTool(), defineToolInput/OutputGuardrail()
│   ├── runner/
│   │   └── runner.ts             # Runner.run(), Runner.stream() — the orchestration
│   ├── tracing/
│   │   └── tracing.ts            # Trace class, trace(), processors, span management
│   └── test/
│       └── index.ts              # Test helpers: createMockModel, makeGenerateTextResult, etc.
│
├── examples/                     # Runnable example projects (workspace packages)
│   ├── 01-hello-world/           # Simplest agent: name + model + instructions
│   │   ├── src/index.ts          # Entry point
│   │   ├── src/index.test.ts     # Example tests (mocked, no API key needed)
│   │   ├── package.json          # deps: ai, ai-sdk-agents (workspace:*), ollama-ai-provider-v2
│   │   └── README.md
│   └── example-plans.md          # Plans for future examples
│
├── docs/                         # Astro Starlight documentation site (workspace package)
│   ├── src/content/docs/
│   │   ├── index.mdx             # Landing page
│   │   └── guides/               # Guide pages
│   │       ├── quickstart.mdx
│   │       ├── agents.mdx
│   │       ├── tools.mdx
│   │       ├── running-agents.mdx
│   │       ├── results.mdx
│   │       ├── handoffs.mdx
│   │       ├── multi-agent.mdx
│   │       ├── guardrails.mdx
│   │       ├── streaming.mdx
│   │       ├── context.mdx
│   │       ├── tracing.mdx
│   │       └── why.mdx
│   └── package.json              # Astro + Starlight + TypeDoc + starlight-llms-txt
│
├── scripts/                      # Shell scripts for workspace-wide commands
│   ├── examples-dev.sh
│   ├── examples-test.sh
│   ├── examples-lint.sh
│   ├── examples-format.sh
│   └── examples-type-check.sh
│
├── package.json                  # Root package (library + workspace scripts)
├── pnpm-workspace.yaml           # Workspace: ".", "docs", "examples/*"
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── eslint.config.js
├── agent.md                      # This file — project context for AI assistants
├── build-phases.md               # Detailed build history and design decisions
└── README.md
```

## Path Aliases

The project uses `@/` as a path alias to `src/`:

## Rules:

- Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.
- Always use named export, never re-export stuff in index.ts files

---

## Development Workflow: Test-Driven Development (TDD)

**Test coverage is critical.** Every piece of code in this library must be tested. Follow a strict TDD approach:

### The TDD Cycle

1. **Think** — Before writing any implementation, analyze the feature/module and identify all test scenarios: happy paths, edge cases, error conditions, and boundary values.
2. **Write tests first** — Create the test file(s) with all test cases. Every test should clearly describe the expected behavior. Tests must be runnable and must **all fail** (red phase).
3. **Verify red** — Run `pnpm test` and confirm every new test fails. If a test passes before implementation exists, the test is not testing anything meaningful — fix it.
4. **Implement** — Write the minimum code needed to make the failing tests pass. No more, no less.
5. **Verify green** — Run `pnpm test` and confirm all tests pass. If any test still fails, fix the implementation (not the test, unless the test itself is wrong).
6. **Refactor** — Clean up the implementation while keeping all tests green. Run tests after every refactor.
7. **Repeat** — Move to the next scenario or module.

### Test Expectations

- **100% of public API must be tested** — every exported function, class, method, and type behavior.
- **Edge cases are not optional** — null/undefined inputs, empty arrays, invalid types, thrown errors, boundary values.
- **Each module gets its own test file** — colocated with source:
  ```
  src/
  ├── agent/
  │   ├── agent.ts
  │   └── agent.test.ts
  ├── handoff/
  │   ├── handoff.ts
  │   └── handoff.test.ts
  ├── guardrail/
  │   ├── guardrail.ts
  │   ├── guardrail.test.ts
  │   ├── tool-guardrail.ts
  │   └── tool-guardrail.test.ts
  ├── runner/
  │   ├── runner.ts
  │   └── runner.test.ts
  └── tracing/
      ├── tracing.ts
      └── tracing.test.ts
  ```
- **Test names describe behavior, not implementation** — use `it("should return the target agent when handoff is triggered")` not `it("calls handoff function")`.
- **Run coverage regularly** — use `pnpm test:coverage` and aim for >95% line/branch coverage. Treat uncovered lines as bugs.
- **Never skip a failing test to unblock work** — fix it or fix the implementation.
