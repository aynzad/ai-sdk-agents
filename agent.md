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

## Tech Stack

- **Runtime:** Node.js >= 18
- **Language:** TypeScript
- **Build:** Vite lib mode (dual CJS/ESM via Rollup)
- **Types:** vite-plugin-dts (bundled .d.ts)
- **Testing:** Vitest
- **Linting:** ESLint + @typescript-eslint
- **Formatting:** Prettier
- **Releases:** Changesets
- **CI:** GitHub Actions
- **Peer deps:** `ai` >= 4.0.0, `zod` >= 3.0.0

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
│              Vercel AI SDK                       │
│  generateText() / streamText() / tool()          │
│  Any provider: OpenAI, Anthropic, Google, etc.   │
└─────────────────────────────────────────────────┘
```

---

## Package Scripts

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

---

## Source File Map

```
src/
├── types.ts              # All shared types, interfaces, and error classes
├── index.ts              # Public API barrel export
├── agent/
│   ├── agent.ts          # Agent class (declarative config, asTool, clone)
├── handoff/
│   ├── handoff.ts        # handoff(), handoffToTool(), handoffFilters, helpers
├── guardrail/
│   ├── guardrail.ts      # guardrail(), llmGuardrail(), built-ins
│   ├── tool-guardrail.ts # guardedTool(), defineToolInput/OutputGuardrail(), BehaviorFactory
├── runner/
│   ├── runner.ts         # Runner.run(), Runner.stream() — the orchestration
├── tracing/
│   ├── tracing.ts        # Trace class, trace(), processors, span management
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
- **Each module gets its own test file** — mirror the `src/` structure under `tests/`:
  ```
  tests/
  ├── agent/
  │   └── agent.test.ts
  ├── handoff/
  │   └── handoff.test.ts
  ├── guardrail/
  │   └── guardrail.test.ts
  ├── runner/
  │   └── runner.test.ts
  ├── tracing/
  │   └── tracing.test.ts
  └── types.test.ts
  ```
- **Test names describe behavior, not implementation** — use `it("should return the target agent when handoff is triggered")` not `it("calls handoff function")`.
- **Run coverage regularly** — use `pnpm test:coverage` and aim for >95% line/branch coverage. Treat uncovered lines as bugs.
- **Never skip a failing test to unblock work** — fix it or fix the implementation.
