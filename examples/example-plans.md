# Example Plans for ai-sdk-agents

This document contains all planned examples for the `ai-sdk-agents` library. Each example demonstrates specific features and patterns. Examples are organized into two types:

- **Console examples** -- Standalone TypeScript projects that run in the terminal with `chalk` for styled output
- **Next.js examples** -- Web applications using `ai-elements` for chat UI and `ai-sdk-agents` for agent orchestration

All examples use `pnpm` and reference the library via `"ai-sdk-agents": "workspace:*"`.

---

## Shared Configuration

### .env.example

Every example includes a `.env.example` with support for three providers:

```
# Choose one provider (or use multiple)

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key

# Google Gemini
GOOGLE_GENERATIVE_AI_API_KEY=your-google-api-key

# Ollama (local - requires ollama-ai-provider-v2 package)
# Install Ollama: https://ollama.com
# Pull model: ollama pull qwen3.5
OLLAMA_BASE_URL=http://localhost:11434/api
OLLAMA_MODEL=qwen3.5
```

### Provider Setup Pattern

Each example includes a shared model setup so users can switch providers:

```typescript
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { createOllama } from "ollama-ai-provider-v2";

const ollama = createOllama({ baseURL: process.env.OLLAMA_BASE_URL });

// Pick one:
const model = openai("gpt-4o-mini");
// const model = google("gemini-2.5-flash");
// const model = ollama(process.env.OLLAMA_MODEL || "qwen3.5");
```

### Folder Naming Convention

Example folders are numbered to match their order in this document:

```
examples/01-hello-world/
examples/02-agent-with-tools/
examples/20-nextjs-chat/
```

### Console Example Structure

```
examples/<##-name>/
  ├── package.json          # pnpm, ai-sdk-agents workspace:*, chalk, providers, vitest, eslint, prettier
  ├── tsconfig.json
  ├── vitest.config.ts
  ├── eslint.config.js
  ├── .env.example
  ├── README.md
  └── src/
      ├── index.ts           # Entry point (runs with real LLM)
      └── index.test.ts      # Tests (imports from ai-sdk-agents/test, no real LLM)
```

### .env Loading in Examples

`tsx` does not load `.env` files automatically. Use Node's built-in `--env-file` flag
in the `start` and `dev` scripts so that `process.env.*` values are available at runtime:

```json
{
  "scripts": {
    "start": "tsx --env-file=.env src/index.ts",
    "dev": "tsx --env-file=.env src/index.ts"
  }
}
```

`--env-file` is supported in Node.js 20.6+ (which `tsx` passes through).
Test scripts (`vitest run`) do **not** need this because tests use mocked models and
never read `.env` values.

### ESLint Config: `projectService` vs `project` in pnpm Workspaces

Example `eslint.config.js` files **must** use `project: true` (not `projectService: true`) in `parserOptions`:

```javascript
parserOptions: {
  project: true,                      // NOT projectService: true
  tsconfigRootDir: import.meta.dirname,
},
```

**Why:** In this pnpm workspace, third-party packages (e.g. `ollama-ai-provider-v2`) are installed via symlinks into the `.pnpm` virtual store. Their type declarations import transitive dependencies (`@ai-sdk/provider`, `@ai-sdk/provider-utils`, `zod/v4`) that live alongside them in the store.

- `tsc --noEmit` and `npx eslint` (CLI) resolve these types correctly by following pnpm's symlink chain.
- `projectService: true` uses TypeScript's **language service project service API**, which in Cursor's ESLint extension fails to follow pnpm symlinks for transitive type dependencies. The imported module's type resolves to TypeScript's internal `error` type, triggering `@typescript-eslint/no-unsafe-call` ("type that could not be resolved") and `@typescript-eslint/no-unsafe-assignment` ("error typed value").
- `project: true` uses the **traditional TypeScript program creation** from `tsconfig.json`, which correctly follows pnpm's symlink structure in the IDE context.

**Symptoms if `projectService: true` is used:**

```
[ERROR] Unsafe assignment of an error typed value. (eslint)
[ERROR] Unsafe call of a type that could not be resolved. (eslint)
```

These appear only in the Cursor IDE (not in CLI). The root cause is not the application code but the ESLint type-checker's module resolution path.

**Additional context:** The workspace VS Code settings (`"eslint.workingDirectories": [{ "mode": "auto" }]`) cause the ESLint extension to detect each example's `eslint.config.js` as a separate working directory. Changes to the root `eslint.config.js` (e.g. adding `examples/**` to ignores) have no effect on example files.

---

### Next.js Example Structure

```
examples/<##-name>/
  ├── package.json          # pnpm, next, ai, ai-sdk-agents workspace:*, playwright
  ├── tsconfig.json
  ├── next.config.ts
  ├── components.json        # shadcn/ui config (created by shadcn init)
  ├── playwright.config.ts
  ├── .env.example
  ├── README.md
  ├── app/
  │   ├── layout.tsx
  │   ├── page.tsx
  │   ├── globals.css         # Tailwind + shadcn base styles
  │   └── api/
  │       └── chat/
  │           └── route.ts
  ├── components/
  │   └── ai-elements/        # Installed via npx shadcn@latest add
  │       ├── message.tsx
  │       ├── conversation.tsx
  │       └── ...
  ├── e2e/
  │   └── chat.spec.ts        # Playwright E2E tests (mocks via page.route())
  └── ...
```

### Next.js Example Setup Steps

Each Next.js example README documents these setup steps:

```bash
# 1. Install dependencies
pnpm install

# 2. Initialize shadcn/ui (if not already done)
pnpm dlx shadcn@latest init

# 3. Install AI Elements components
pnpm dlx shadcn@latest add @ai-elements/conversation
pnpm dlx shadcn@latest add @ai-elements/message

# 4. Copy .env.example to .env.local and fill in provider keys
cp .env.example .env.local

# 5. Run the dev server
pnpm dev

# 6. Run E2E tests
pnpm test:e2e
```

Components are installed directly into `components/ai-elements/` via the shadcn registry. They become part of the project source and are fully customizable.

### Cursor Skills Referenced

When implementing the Next.js examples, follow these Cursor agent skills:

- **`/ai-elements`** -- Component API, installation via `npx shadcn@latest add @ai-elements/*`, usage patterns for `Message`, `MessageContent`, `MessageResponse`, `Conversation`, and customization
- **`/ai-sdk`** -- AI SDK APIs (`useChat`, `streamText`, `generateText`), provider setup, agent patterns, and `ToolLoopAgent`. Always verify APIs against `node_modules/ai/docs/` -- do not trust cached knowledge
- **`/playwright-best-practices`** -- E2E test writing, locator strategies, assertion/waiting patterns, debugging flaky tests, CI configuration, and `page.route()` for API mocking

---

## Testing Strategy

Every example includes tests that verify behavior without making real LLM API calls. Tests use **Vitest** and mock the AI SDK's `generateText`/`streamText` functions so examples are fully deterministic and run offline.

### Prerequisite: `ai-sdk-agents/test` Entrypoint (must be implemented first)

Before building the examples, the library itself must ship a `ai-sdk-agents/test` entrypoint with official test utilities. This follows the same pattern as AI SDK's own `ai/test` module. All examples (and all users of the library) import from this single source.

**New file:** `src/test/index.ts`

**New export in `package.json`:**

```json
{
  "exports": {
    ".": { "import": "...", "require": "..." },
    "./test": {
      "import": {
        "types": "./dist/test/index.d.ts",
        "default": "./dist/test/index.js"
      },
      "require": {
        "types": "./dist/test/index.d.ts",
        "default": "./dist/test/index.cjs"
      }
    }
  }
}
```

**What `ai-sdk-agents/test` exports:**

| Export                                      | Purpose                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `createMockModel()`                         | Returns a `LanguageModelV1` with `vi.fn()` stubs for `doGenerate`/`doStream`             |
| `makeGenerateTextResult(overrides?)`        | Builds a complete `generateText` return value with sensible defaults                     |
| `makeStreamTextResult(overrides?)`          | Builds a complete `streamText` return value with async generators                        |
| `makeToolCallStep(toolName, args, result?)` | Builds a step containing a tool call + optional tool result                              |
| `makeHandoffStep(handoffToolName)`          | Builds a step that triggers a handoff tool                                               |
| `setupMockAI()`                             | Returns `{ mockGenerateText, mockStreamText }` — hoisted mocks ready for `vi.mock("ai")` |

### `ai-sdk-agents/test` API Reference

#### `createMockModel()`

```typescript
import { createMockModel } from "ai-sdk-agents/test";

const model = createMockModel();
// model.doGenerate and model.doStream are vi.fn() stubs
```

#### `makeGenerateTextResult(overrides?)`

```typescript
import { makeGenerateTextResult } from "ai-sdk-agents/test";

// Simple text response
makeGenerateTextResult({ text: "Hello world" });

// Response with tool calls
makeGenerateTextResult({
  text: "",
  steps: [
    {
      stepType: "initial",
      text: "",
      toolCalls: [
        {
          toolCallId: "call-1",
          toolName: "getWeather",
          args: { location: "Tokyo" },
        },
      ],
      toolResults: [
        { toolCallId: "call-1", toolName: "getWeather", result: { temp: 22 } },
      ],
      finishReason: "tool-calls",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    },
    {
      stepType: "tool-result",
      text: "The weather in Tokyo is 22C.",
      toolCalls: [],
      toolResults: [],
      finishReason: "stop",
      usage: { promptTokens: 20, completionTokens: 15, totalTokens: 35 },
    },
  ],
});
```

#### `makeStreamTextResult(overrides?)`

```typescript
import { makeStreamTextResult } from "ai-sdk-agents/test";

// Simple streaming text
makeStreamTextResult({ textDeltas: ["Hello", " ", "world!"] });

// Customized usage and finish reason
makeStreamTextResult({
  textDeltas: ["Streaming..."],
  usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
  finishReason: "length",
});
```

#### `makeToolCallStep(toolName, args, result?)`

```typescript
import { makeToolCallStep } from "ai-sdk-agents/test";

const step = makeToolCallStep(
  "getWeather",
  { location: "Tokyo" },
  { temp: 22, conditions: "sunny" },
);
// Returns a fully-formed step object with toolCalls and toolResults
```

#### `makeHandoffStep(handoffToolName)`

```typescript
import { makeHandoffStep } from "ai-sdk-agents/test";

const step = makeHandoffStep("handoff_to_spanish_agent");
// Returns a step that triggers a handoff tool call
```

#### `setupMockAI()`

Convenience for the common `vi.mock("ai")` boilerplate:

```typescript
import { setupMockAI } from "ai-sdk-agents/test";

const { mockGenerateText, mockStreamText } = vi.hoisted(() => setupMockAI());

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: mockGenerateText,
    streamText: mockStreamText,
  };
});
```

### How Examples Use `ai-sdk-agents/test`

#### Console Example Test Structure

```
examples/<name>/
  ├── src/
  │   ├── index.ts
  │   └── index.test.ts      # Tests importing from ai-sdk-agents/test
  ├── vitest.config.ts
  └── package.json            # ai-sdk-agents: workspace:*, vitest in devDeps
```

#### `vitest.config.ts` (shared across examples)

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

#### Example Test: hello-world

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent, Runner } from "ai-sdk-agents";
import {
  createMockModel,
  makeGenerateTextResult,
  setupMockAI,
} from "ai-sdk-agents/test";

const { mockGenerateText } = vi.hoisted(() => setupMockAI());

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: mockGenerateText };
});

describe("hello-world", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should run the agent and return a response", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: "Code flows like stream\nBits align in harmony\nSilicon dreams wake",
      }),
    );

    const agent = new Agent({
      name: "Haiku Agent",
      model: createMockModel(),
      instructions: "You respond only in haiku.",
    });

    const result = await Runner.run(agent, "Write a haiku about programming.");
    expect(result.output).toContain("Code flows");
  });
});
```

#### Example Test: agent-with-tools (using `makeToolCallStep`)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent, Runner } from "ai-sdk-agents";
import {
  createMockModel,
  makeGenerateTextResult,
  makeToolCallStep,
  setupMockAI,
} from "ai-sdk-agents/test";

const { mockGenerateText } = vi.hoisted(() => setupMockAI());

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: mockGenerateText };
});

describe("agent-with-tools", () => {
  beforeEach(() => mockGenerateText.mockReset());

  it("should call the weather tool and return a response", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: "The weather in Tokyo is 22C and sunny.",
        steps: [
          makeToolCallStep(
            "getWeather",
            { location: "Tokyo" },
            { temp: 22, conditions: "sunny" },
          ),
          {
            stepType: "tool-result",
            text: "The weather in Tokyo is 22C and sunny.",
            toolCalls: [],
            toolResults: [],
            finishReason: "stop",
            usage: { promptTokens: 20, completionTokens: 15, totalTokens: 35 },
          },
        ],
      }),
    );

    const agent = new Agent({
      name: "Weather Agent",
      model: createMockModel(),
      instructions: "You help with weather.",
      tools: {
        /* ... */
      },
    });

    const result = await Runner.run(agent, "What's the weather in Tokyo?");
    expect(result.output).toContain("Tokyo");
  });
});
```

#### Example Test: agent-handoff (using `makeHandoffStep`)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent, Runner, handoff } from "ai-sdk-agents";
import {
  createMockModel,
  makeGenerateTextResult,
  makeHandoffStep,
  setupMockAI,
} from "ai-sdk-agents/test";

const { mockGenerateText } = vi.hoisted(() => setupMockAI());

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: mockGenerateText };
});

describe("agent-handoff", () => {
  beforeEach(() => mockGenerateText.mockReset());

  it("should hand off to the Spanish agent", async () => {
    mockGenerateText
      .mockResolvedValueOnce(
        makeGenerateTextResult({
          text: "",
          steps: [makeHandoffStep("handoff_to_spanish_agent")],
        }),
      )
      .mockResolvedValueOnce(
        makeGenerateTextResult({ text: "Hola! Como puedo ayudarte?" }),
      );

    const spanishAgent = new Agent({
      name: "Spanish Agent",
      model: createMockModel(),
      instructions: "You respond in Spanish.",
    });

    const triageAgent = new Agent({
      name: "Triage Agent",
      model: createMockModel(),
      instructions: "Route to the correct agent.",
      handoffs: [handoff(spanishAgent)],
    });

    const result = await Runner.run(triageAgent, "Hola, necesito ayuda");
    expect(result.output).toContain("Hola");
  });
});
```

### Refactoring: Existing Library Tests

Once `ai-sdk-agents/test` is implemented, the library's own test files should also be refactored to use it:

| File                              | Current Pattern                                                                 | After Refactor        |
| --------------------------------- | ------------------------------------------------------------------------------- | --------------------- |
| `src/agent/agent.test.ts`         | Local `createMockModel()`                                                       | Import from `../test` |
| `src/runner/runner.test.ts`       | Local `createMockModel()`, `makeGenerateTextResult()`, `makeStreamTextResult()` | Import from `../test` |
| `src/guardrail/guardrail.test.ts` | Local `createMockModel()`, `createGuardrailInput()`                             | Import from `../test` |
| `src/handoff/handoff.test.ts`     | Local `createMockModel()`, `createMockAgent()`                                  | Import from `../test` |

### Implementation Order

1. **Implement `src/test/index.ts`** with all exports
2. **Add `./test` export** to `package.json` exports map
3. **Update `vite.config.ts`** build to include the test entrypoint
4. **Refactor existing library tests** to use the new shared helpers
5. **Run existing tests** to verify nothing breaks
6. **Then build examples** -- each imports from `ai-sdk-agents/test`

### Next.js Example Test Structure

Next.js examples use **Playwright** for end-to-end testing. The dev server is started with mocked API routes (LLM responses are mocked server-side via `vi.mock("ai")` in the route handler, or by intercepting requests with `page.route()`). Playwright tests interact with the actual rendered UI in a real browser.

```
examples/<name>/
  ├── app/
  │   └── api/chat/
  │       └── route.ts
  ├── e2e/
  │   ├── chat.spec.ts          # Playwright E2E tests
  │   └── fixtures.ts           # Shared test fixtures (mock responses, page helpers)
  ├── playwright.config.ts
  ├── vitest.config.ts           # For unit-testing route handlers if needed
  └── package.json
```

### `playwright.config.ts` (for Next.js examples)

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

### Mocking LLM in Playwright Tests

Use `page.route()` to intercept the API route and return a mocked streaming response, so no real LLM calls are made:

```typescript
import { test, expect } from "@playwright/test";

test("chat sends message and displays streamed response", async ({ page }) => {
  // Intercept the chat API route and return a mock stream
  await page.route("**/api/chat", async (route) => {
    const encoder = new TextEncoder();
    const body = [
      `0:"Hello"\n`,
      `0:" from"\n`,
      `0:" the agent!"\n`,
      `e:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":5}}\n`,
      `d:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":5}}\n`,
    ].join("");

    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Vercel-AI-Data-Stream": "v1",
      },
      body,
    });
  });

  await page.goto("/");
  await page.getByRole("textbox").fill("Hello");
  await page.getByRole("button", { name: /send/i }).click();
  await expect(page.getByText("Hello from the agent!")).toBeVisible();
});
```

### Playwright Test: Handoff Visibility (nextjs-multi-agent)

```typescript
test("handoff shows agent switch in UI", async ({ page }) => {
  let callCount = 0;
  await page.route("**/api/chat", async (route) => {
    callCount++;
    // First response includes a handoff event, second is the new agent's reply
    const body =
      callCount === 1
        ? `0:"Transferring to FAQ agent..."\n2:["handoff",{"from":"Triage","to":"FAQ Agent"}]\nd:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":5}}\n`
        : `0:"Here is the answer to your question."\nd:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":5}}\n`;

    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Vercel-AI-Data-Stream": "v1",
      },
      body,
    });
  });

  await page.goto("/");
  await page.getByRole("textbox").fill("What is your refund policy?");
  await page.getByRole("button", { name: /send/i }).click();
  await expect(page.getByText("FAQ Agent")).toBeVisible();
});
```

### Playwright Test: Human-in-the-Loop Approval (nextjs-human-in-the-loop)

```typescript
test("tool call shows approval dialog and executes on approve", async ({
  page,
}) => {
  await page.route("**/api/chat", async (route) => {
    const body = `0:"I need to update your booking."\n2:["tool-approval",{"toolName":"updateBooking","args":{"seat":"12A"}}]\n`;
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Vercel-AI-Data-Stream": "v1",
      },
      body,
    });
  });

  await page.goto("/");
  await page.getByRole("textbox").fill("Change my seat to 12A");
  await page.getByRole("button", { name: /send/i }).click();

  // Approval dialog appears
  await expect(page.getByText("updateBooking")).toBeVisible();
  await expect(page.getByText("12A")).toBeVisible();

  // Approve the tool call
  await page.getByRole("button", { name: /approve/i }).click();
  await expect(page.getByText("Booking updated")).toBeVisible();
});
```

### `package.json` Test Dependencies

**Console examples:**

```json
{
  "devDependencies": {
    "vitest": "^2.0.0",
    "@types/node": "^22.0.0",
    "eslint": "^9.0.0",
    "@eslint/js": "^9.39.4",
    "typescript-eslint": "^8.57.0",
    "eslint-config-prettier": "^9.0.0",
    "globals": "^17.4.0",
    "prettier": "^3.4.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write \"src/**/*.ts\"",
    "check-format": "prettier --check \"src/**/*.ts\""
  }
}
```

**Next.js examples:**

```json
{
  "devDependencies": {
    "vitest": "^2.0.0",
    "@playwright/test": "^1.50.0",
    "@types/node": "^22.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

### What Each Example Tests

| #   | Folder                        | Test Type  | Test Focus                                               |
| --- | ----------------------------- | ---------- | -------------------------------------------------------- |
| 1   | `01-hello-world`              | Vitest     | Agent returns expected text                              |
| 2   | `02-agent-with-tools`         | Vitest     | Tool is called with correct args, result incorporated    |
| 3   | `03-streaming`                | Vitest     | Stream events arrive in correct order                    |
| 4   | `04-structured-output`        | Vitest     | Output matches Zod schema                                |
| 5   | `05-dynamic-instructions`     | Vitest     | Different contexts produce different instructions        |
| 6   | `06-lifecycle-hooks`          | Vitest     | Hooks fire in correct order with correct data            |
| 7   | `07-agent-handoff`            | Vitest     | Handoff transfers to correct agent                       |
| 8   | `08-handoff-with-filters`     | Vitest     | Message history is filtered correctly                    |
| 9   | `09-agent-as-tool`            | Vitest     | Sub-agent executes and returns result to parent          |
| 10  | `10-input-output-guardrails`  | Vitest     | Guardrails trip on bad input/output, pass on good        |
| 11  | `11-tool-guardrails`          | Vitest     | Tool guardrails block/allow based on behavior config     |
| 12  | `12-llm-guardrail`            | Vitest     | LLM judge trips when output is problematic               |
| 13  | `13-keyword-guardrail`        | Vitest     | Each built-in guardrail triggers on matching content     |
| 14  | `14-parallel-agents`          | Vitest     | All agents run concurrently, results collected           |
| 15  | `15-agent-routing`            | Vitest     | Correct specialist agent is selected per language        |
| 16  | `16-deterministic-flow`       | Vitest     | Pipeline stages execute in order with correct data flow  |
| 17  | `17-tracing`                  | Vitest     | Trace spans are recorded for agent, tool, and handoff    |
| 18  | `18-customer-service-bot`     | Vitest     | Triage routes correctly, tools execute, multi-turn works |
| 19  | `19-research-bot`             | Vitest     | Planner, searcher, writer execute in correct sequence    |
| 20  | `20-nextjs-chat`              | Playwright | Chat input sends message, streamed response renders      |
| 21  | `21-nextjs-multi-agent`       | Playwright | Handoff events show agent switch in UI                   |
| 22  | `22-nextjs-human-in-the-loop` | Playwright | Approval dialog appears, approve/reject flow works       |

---

## Console Examples

### 1. hello-world -- DONE

**Inspired by:** openai-agents-js `basic/` hello-world

**Goal:** Demonstrate the simplest possible agent setup -- create an agent and run it to get a response.

**Description:** Creates a single agent with a name, model, and system instructions, then uses `Runner.run()` to send a prompt and print the result. The agent responds in haiku format to show that instructions are followed. Uses `chalk` to style the output with agent name and response.

**Key Features:**

- `Agent` (name, model, instructions)
- `Runner.run()`
- `RunResult` (output, usage)

---

### 2. agent-with-tools -- DONE

**Inspired by:** openai-agents-js `basic/` tools

**Goal:** Show how to give an agent custom tools and have it call them during a conversation.

**Description:** Creates an agent with two tools: a weather lookup tool and a time zone tool, both defined with Zod schemas. The user asks a question that requires tool use (e.g., "What's the weather in Tokyo?"), and the agent automatically calls the appropriate tool, receives the result, and incorporates it into its response. Displays tool calls and results in the console with chalk formatting.

**Key Features:**

- `Agent` with `tools`
- AI SDK `tool()` with Zod schemas
- `Runner.run()` with tool execution
- `RunResult.steps` (inspecting tool calls)

---

### 3. streaming -- DONE

**Inspired by:** openai-agents-js `basic/` streaming

**Goal:** Demonstrate real-time streaming of agent responses and events.

**Description:** Creates an agent and uses `Runner.stream()` to get a streaming response. Iterates over `StreamEvent` objects to display text chunks as they arrive, agent start/end events, and tool call events. Shows how to access the final `RunResult` after the stream completes. Uses chalk to differentiate event types in the console output.

**Key Features:**

- `Runner.stream()`
- `StreamResult.events` async iterable
- `StreamEvent` types (textDelta, agentStart, agentEnd, toolCall, toolResult)
- `StreamResult.result` promise

---

### 4. structured-output -- DONE

**Inspired by:** openai-agents-js `basic/` structured-output

**Goal:** Show how to constrain agent output to a specific schema using Zod.

**Description:** Creates an agent with an `outputSchema` defined as a Zod object (e.g., a movie recommendation with title, year, genre, and synopsis fields). The agent's response is automatically parsed and validated against the schema. Displays the typed, structured result in the console. Demonstrates type safety -- the result is fully typed in TypeScript.

**Key Features:**

- `Agent` with `outputSchema` (Zod)
- Typed `RunResult.output`
- Schema validation of LLM output

---

### 5. dynamic-instructions -- DONE

**Inspired by:** openai-agents-js `basic/` dynamic-system-prompt

**Goal:** Demonstrate how to use dynamic instructions that change based on runtime context.

**Description:** Creates an agent whose `instructions` is an async function receiving `RunContext`. The context carries user preferences (language, expertise level) injected via `RunConfig.context`. The instructions adapt the agent's behavior based on these preferences. Shows two runs with different contexts producing different response styles. Uses chalk to highlight the context values and response differences.

**Key Features:**

- `Agent` with `instructions` as async function
- `RunContext<TContext>` with custom context type
- `RunConfig.context` for dependency injection
- Dynamic behavior based on runtime state

---

### 6. lifecycle-hooks -- DONE

**Inspired by:** openai-agents-js `basic/` lifecycle-hooks

**Goal:** Show how to observe and react to agent lifecycle events using hooks.

**Description:** Creates an agent with `AgentHooks` (onStart, onEnd, onToolCall, onToolResult, onHandoff, onError) and runs it with `RunHooks` (onRunStart, onRunEnd, onAgentStart, onAgentEnd). Each hook logs a styled message to the console showing when it fires and what data it receives. The agent has a tool so that tool-related hooks also fire. Demonstrates the full lifecycle of a run.

**Key Features:**

- `AgentHooks` (onStart, onEnd, onToolCall, onToolResult, onHandoff, onError)
- `RunHooks` (onRunStart, onRunEnd, onAgentStart, onAgentEnd, onHandoff, onGuardrailTripped)
- Hook execution order

---

### 7. agent-handoff -- DONE

**Inspired by:** openai-agents-js `handoffs/` basic

**Goal:** Demonstrate how one agent can hand off a conversation to another agent.

**Description:** Sets up two agents: a triage agent that speaks English and a Spanish assistant. The triage agent has a handoff to the Spanish assistant. When the user asks a question in Spanish, the triage agent recognizes this and triggers the handoff. The Spanish assistant then takes over and responds. Uses chalk to clearly show which agent is active and when the handoff occurs.

**Key Features:**

- `handoff()` function
- `Agent` with `handoffs` array
- `Runner.run()` with automatic handoff execution
- `RunResult` showing agent switches

---

### 8. handoff-with-filters -- DONE

**Inspired by:** openai-agents-js `handoffs/` message-filter

**Goal:** Show how to filter messages during a handoff to control what context the receiving agent sees.

**Description:** Builds on the handoff example by adding message filters. Demonstrates `handoffFilters.removeToolMessages` (strip tool call/result messages before handoff), `handoffFilters.keepLast(n)` (keep only the last N messages), and `handoffFilters.compose()` (combine multiple filters). Shows the message history before and after filtering in the console to visualize what each filter does.

**Key Features:**

- `handoffFilters.removeToolMessages`
- `handoffFilters.keepLast(n)`
- `handoffFilters.keepConversation`
- `handoffFilters.removeAll`
- `handoffFilters.compose()`
- Message history inspection

---

### 9. agent-as-tool -- DONE

**Inspired by:** openai-agents-js `agent-patterns/` agents-as-tools

**Goal:** Demonstrate using one agent as a tool for another agent, enabling sub-agent delegation.

**Description:** Creates a translator agent and exposes it as a tool using `agent.asTool()`. A main orchestrator agent has this translator tool available. When asked to translate text, the orchestrator delegates to the translator agent via the tool interface. Unlike handoffs, the orchestrator retains control and can use the translation result in its own response. Shows the difference between agent-as-tool (delegation) and handoff (transfer).

**Key Features:**

- `agent.asTool()` with `AsToolOptions`
- Agent composition via tool interface
- Orchestrator pattern (parent agent delegates to child)

---

### 10. input-output-guardrails -- DONE

**Inspired by:** openai-agents-js `agent-patterns/` guardrails

**Goal:** Show how to validate agent inputs and outputs using guardrails that can trip and halt execution.

**Description:** Creates an agent with an input guardrail that checks for prompt injection attempts and an output guardrail that ensures responses don't contain sensitive information. Demonstrates what happens when a guardrail trips: the `GuardrailTripwiredError` is thrown with details about which guardrail was triggered and why. Shows both passing and failing cases.

**Key Features:**

- `guardrail()` function
- `Agent` with `inputGuardrails` and `outputGuardrails`
- `GuardrailTripwiredError` handling
- `GuardrailResult` with `tripwired` and `reason`

---

### 11. tool-guardrails -- DONE

**Inspired by:** New example (not in openai-agents-js) -- unique to ai-sdk-agents

**Goal:** Demonstrate tool-level guardrails that validate tool inputs and outputs independently.

**Description:** Creates a tool wrapped with `guardedTool()` that has both input and output guardrails. The input guardrail validates that tool arguments meet safety criteria (e.g., no SQL injection in a database query tool). The output guardrail checks that tool results don't contain PII. Shows different `ToolGuardrailBehavior` options: `allow`, `rejectContent`, and `throwException`. Demonstrates `ToolGuardrailTripwiredError`.

**Key Features:**

- `guardedTool()`
- `defineToolInputGuardrail()`
- `defineToolOutputGuardrail()`
- `ToolGuardrailBehaviorFactory` (allow, rejectContent, throwException)
- `ToolGuardrailTripwiredError`
- `isGuardedTool()`

---

### 12. llm-guardrail -- DONE

**Inspired by:** openai-agents-js `agent-patterns/` llm-as-judge

**Goal:** Show how to use another LLM as a guardrail judge to evaluate agent outputs.

**Description:** Creates an agent with an `llmGuardrail` that uses a separate model call to evaluate whether the agent's response is appropriate, factual, or meets quality criteria. The guardrail LLM acts as a judge, returning a structured assessment. If the judge determines the output is problematic, the guardrail trips. Shows the judge prompt, the evaluation result, and the trip decision.

**Key Features:**

- `llmGuardrail()` with model, promptBuilder, tripWhen
- LLM-as-a-judge pattern
- Structured evaluation from guardrail model
- Combining with other guardrails

---

### 13. keyword-guardrail -- DONE

**Inspired by:** New example (not in openai-agents-js) -- showcases ai-sdk-agents built-in guardrail helpers

**Goal:** Demonstrate the built-in guardrail helper functions for common validation patterns.

**Description:** Shows three built-in guardrail helpers in action: `keywordGuardrail` blocks messages containing specific words, `maxLengthGuardrail` limits response length, and `regexGuardrail` matches patterns (e.g., blocking credit card numbers). Runs the agent with various inputs to trigger each guardrail and displays the results.

**Key Features:**

- `keywordGuardrail({ blockedKeywords, caseSensitive? })`
- `maxLengthGuardrail({ maxLength })`
- `regexGuardrail({ pattern, reason? })`
- Composing multiple guardrails on one agent

---

### 14. parallel-agents -- DONE

**Inspired by:** openai-agents-js `agent-patterns/` parallel

**Goal:** Show how to run multiple agents in parallel and combine their results.

**Description:** Creates three specialist agents (optimist, pessimist, neutral analyst) and runs them all in parallel using `Promise.all` with `Runner.run()`. Each agent analyzes the same topic from a different perspective. The results are collected and a final synthesizer agent combines the three analyses into a balanced report. Demonstrates concurrent agent execution for speed and diverse outputs.

**Key Features:**

- Multiple `Runner.run()` calls in `Promise.all`
- Agent specialization via instructions
- Result aggregation pattern
- Parallel execution for performance

---

### 15. agent-routing -- DONE

**Inspired by:** openai-agents-js `agent-patterns/` routing

**Goal:** Demonstrate a triage/routing pattern where a central agent routes to specialized agents.

**Description:** Creates a triage agent with handoffs to three language-specific agents (English, French, German). The triage agent detects the user's language and hands off to the appropriate specialist. Each specialist agent has domain-specific instructions and tools. Shows how handoffs enable clean separation of concerns in multi-agent systems.

**Key Features:**

- Triage/router agent pattern
- Multiple `handoff()` targets
- Language detection and routing
- Specialized agent instructions per domain

---

### 16. deterministic-flow -- DONE

**Inspired by:** openai-agents-js `agent-patterns/` deterministic

**Goal:** Show how to chain agents in a deterministic pipeline where each step feeds into the next.

**Description:** Creates a three-stage pipeline: (1) a research agent with `outputSchema` that extracts key facts, (2) a quality-check agent that validates the facts, and (3) a writer agent that produces a final summary. Each agent's structured output is fed as input to the next agent. The flow is deterministic -- no handoffs or routing, just sequential execution with validation gates between stages.

**Key Features:**

- Sequential `Runner.run()` calls
- `outputSchema` for structured intermediate results
- Pipeline/chain pattern
- Quality gates between stages

---

### 17. tracing -- DONE

**Inspired by:** New example (not in openai-agents-js) -- unique to ai-sdk-agents tracing system

**Goal:** Demonstrate the tracing system for observability across agent runs.

**Description:** Sets up `consoleTraceProcessor` and `memoryTraceProcessor`, then runs an agent with tools and a handoff. The console processor prints trace spans in real-time showing agent execution, LLM calls, tool invocations, and handoffs. After the run, the memory processor's collected spans are displayed in a tree structure. Shows how to add custom spans with `trace()` and inspect trace data for debugging.

**Key Features:**

- `addTraceProcessor()` / `removeTraceProcessor()`
- `consoleTraceProcessor()` for real-time logging
- `memoryTraceProcessor()` for span collection
- `trace()` for custom spans
- `Trace` and `TraceSpan` inspection
- `RunResult.traceId`

---

### 18. customer-service-bot -- DONE

**Inspired by:** openai-agents-js `customer-service/`

**Goal:** Build a complete multi-agent customer service system that demonstrates real-world usage.

**Description:** An airline customer service bot with three agents: a triage agent that classifies the customer's intent, an FAQ agent with a knowledge-lookup tool, and a booking agent with seat-change and flight-info tools. The triage agent hands off to the appropriate specialist. Runs as an interactive CLI loop where the user can have a multi-turn conversation. Demonstrates tools, handoffs, and multi-agent orchestration in a realistic scenario.

**Key Features:**

- Multi-agent architecture (triage + specialists)
- `handoff()` with conditional routing
- Multiple tools per agent
- Interactive CLI conversation loop
- Real-world use case pattern

---

### 19. research-bot -- DONE

**Inspired by:** openai-agents-js `research-bot/`

**Goal:** Orchestrate multiple agents to produce a detailed research report on any topic.

**Description:** A research workflow with three agents coordinated by a manager: (1) a planner agent that suggests search terms given a research query, (2) a search agent that looks up information and produces summaries, and (3) a writer agent that synthesizes all summaries into a coherent report. The manager runs the planner, dispatches multiple search agents in parallel, collects results, and feeds them to the writer. Outputs the final report to the console with chalk formatting.

**Key Features:**

- Multi-agent orchestration (planner + searcher + writer)
- `agent.asTool()` or sequential `Runner.run()` for coordination
- Parallel search execution with `Promise.all`
- `outputSchema` for structured intermediate data
- Manager/coordinator pattern

---

## Next.js Examples

> **Skills:** When implementing these examples, follow the `/ai-elements`, `/ai-sdk`, and `/playwright-best-practices` Cursor agent skills for up-to-date APIs and best practices.

### 20. nextjs-chat

**Inspired by:** openai-agents-js `ai-sdk-ui/` and `nextjs/`

**Goal:** Build a basic chat interface powered by an ai-sdk-agents agent with streaming responses.

**Description:** A Next.js application with a chat UI built using AI Elements components installed via the shadcn registry. The backend API route creates an agent and uses `Runner.stream()` to produce a streaming response compatible with AI SDK's `useChat` hook. The frontend uses `Message`, `MessageContent`, and `MessageResponse` components to render messages with proper styling for user vs assistant roles. Messages stream in real-time as they arrive. Demonstrates the simplest way to connect ai-sdk-agents to a web UI.

**AI Elements Components (install via shadcn):**

```bash
pnpm dlx shadcn@latest add @ai-elements/conversation
pnpm dlx shadcn@latest add @ai-elements/message
```

**Key Features:**

- Next.js App Router API route (`app/api/chat/route.ts`)
- `Runner.stream()` on the server
- AI SDK `useChat` hook on the client (see `/ai-sdk` skill for current API)
- `@ai-elements/message` -- `Message`, `MessageContent`, `MessageResponse` (see `/ai-elements` skill)
- `@ai-elements/conversation` -- conversation container with scroll management
- Server-to-client streaming

**Playwright E2E Tests (see `/playwright-best-practices` skill):**

- Send a message and verify streamed response renders
- Verify message roles (user vs assistant) display correctly
- Test empty state and loading indicators

---

### 21. nextjs-multi-agent

**Inspired by:** openai-agents-js `customer-service/` + `handoffs/`

**Goal:** Create a chat application where multiple agents collaborate with visible handoff indicators in the UI.

**Description:** Extends the chat example with multiple agents and handoffs. The UI shows which agent is currently active via a name badge on each message, displays handoff events as system-style messages, and lets users see the agent transitions. Uses the customer service scenario (triage -> FAQ / booking agents) but rendered in a polished web interface. The backend streams agent events including handoff notifications to the frontend. AI Elements components are customized to show agent identity per message.

**AI Elements Components (install via shadcn):**

```bash
pnpm dlx shadcn@latest add @ai-elements/conversation
pnpm dlx shadcn@latest add @ai-elements/message
```

**Key Features:**

- Multi-agent with `handoff()` on the server
- Streaming handoff events to the client
- `@ai-elements/message` customized with agent name badges (modify `message.tsx` to add agent identity -- see `/ai-elements` skill for customization patterns)
- `RunHooks.onHandoff` for event propagation
- Real-time agent switching visible in the UI

**Playwright E2E Tests (see `/playwright-best-practices` skill):**

- Verify handoff event shows agent name change in UI
- Test that messages from different agents have distinct indicators
- Test multi-turn conversation across agent handoffs

---

### 22. nextjs-human-in-the-loop

**Inspired by:** openai-agents-js `nextjs/` HITL

**Goal:** Build an approval workflow where tool calls require user confirmation before executing.

**Description:** A Next.js app where an agent has tools that require human approval. When the agent wants to call a tool (e.g., update a database record), the UI renders an approval dialog showing the tool name and arguments. The user can approve or reject. On approval, the tool executes and the agent continues. Uses agent hooks to intercept tool calls and pause execution until the user responds. AI Elements components render the conversation, while a custom approval card component handles the tool call confirmation UX.

**AI Elements Components (install via shadcn):**

```bash
pnpm dlx shadcn@latest add @ai-elements/conversation
pnpm dlx shadcn@latest add @ai-elements/message
```

**Key Features:**

- `AgentHooks.onToolCall` for interception
- `@ai-elements/message` for conversation display (see `/ai-elements` skill)
- Custom approval card component (tool name, args preview, approve/reject buttons)
- Approve/reject flow with server round-trip
- Resumable agent execution after approval
- AI SDK `useChat` with tool call handling (see `/ai-sdk` skill for `InferAgentUIMessage` type safety)

**Playwright E2E Tests (see `/playwright-best-practices` skill):**

- Verify tool call triggers approval dialog with correct tool name and arguments
- Test approve flow: dialog dismisses, tool executes, agent continues
- Test reject flow: dialog dismisses, agent receives rejection and responds accordingly
- Use `page.route()` to mock the chat API and simulate tool approval events

---

## CI/CD: GitHub Actions Workflows

Two new workflows to add under `.github/workflows/`. The existing `deploy-docs.yml` remains unchanged.

### Workflow 1: `ci.yml` -- Library Lint, Format, Type-check, and Tests

Runs on every push and PR. Validates the core `ai-sdk-agents` library.

**Triggers:** Push to `main`, all pull requests
**Skips:** Changes only in `docs/` or `examples/` (those have their own workflows)

```yaml
name: CI

on:
  push:
    branches: [main]
    paths-ignore:
      - "docs/**"
      - "examples/**"
      - "*.md"
  pull_request:
    paths-ignore:
      - "docs/**"
      - "examples/**"
      - "*.md"

jobs:
  lint:
    name: Lint & Format
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: pnpm/action-setup@v4
        with:
          version: 10.30.3
          run_install: true
      - name: Lint
        run: pnpm lint
      - name: Format check
        run: pnpm prettier --check "src/**/*.ts"

  type-check:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: pnpm/action-setup@v4
        with:
          version: 10.30.3
          run_install: true
      - name: Type check
        run: pnpm type-check

  test:
    name: Tests
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - uses: pnpm/action-setup@v4
        with:
          version: 10.30.3
          run_install: true
      - name: Build library
        run: pnpm build
      - name: Run tests
        run: pnpm test
      - name: Run tests with coverage
        if: matrix.node-version == 20
        run: pnpm test:coverage

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: pnpm/action-setup@v4
        with:
          version: 10.30.3
          run_install: true
      - name: Build library
        run: pnpm build
      - name: Build types
        run: pnpm build:types
      - name: Verify dist output
        run: |
          test -f dist/ai-sdk-agents.js
          test -f dist/ai-sdk-agents.cjs
          test -f dist/index.d.ts
```

**Jobs summary:**

| Job          | What it checks                                         | Runs on         |
| ------------ | ------------------------------------------------------ | --------------- |
| `lint`       | ESLint rules + Prettier formatting                     | ubuntu-latest   |
| `type-check` | TypeScript `tsc --noEmit`                              | ubuntu-latest   |
| `test`       | Vitest unit tests (mocked LLM)                         | Node 18, 20, 22 |
| `build`      | Vite build + type declarations + verify dist artifacts | ubuntu-latest   |

---

### Workflow 2: `ci-examples.yml` -- Test All Examples

Runs on every push and PR that touches the `examples/` folder or the library source. Ensures all examples build and their tests pass. Uses the root-level `examples:*` scripts from `package.json` (backed by `scripts/examples-*.sh`).

**Root scripts available:**

| Script                     | No arg (all examples)    | With number (e.g. `1`)      |
| -------------------------- | ------------------------ | --------------------------- |
| `pnpm examples:test`       | Tests all examples       | Tests example 01 only       |
| `pnpm examples:lint`       | Lints all examples       | Lints example 01 only       |
| `pnpm examples:format`     | Formats all examples     | Formats example 01 only     |
| `pnpm examples:type-check` | Type-checks all examples | Type-checks example 01 only |
| `pnpm examples:dev 1`      | --                       | Runs example 01             |

**Triggers:** Push to `main`, all pull requests -- when `examples/**`, `src/**`, or `package.json` change

```yaml
name: CI Examples

on:
  push:
    branches: [main]
    paths:
      - "examples/**"
      - "src/**"
      - "package.json"
      - "pnpm-workspace.yaml"
  pull_request:
    paths:
      - "examples/**"
      - "src/**"
      - "package.json"
      - "pnpm-workspace.yaml"

jobs:
  check-all-examples:
    name: Lint, Format, Type-check & Test All Examples
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: pnpm/action-setup@v4
        with:
          version: 10.30.3
          run_install: true
      - name: Build library
        run: pnpm build
      - name: Format check
        run: pnpm examples:format
      - name: Type check
        run: pnpm examples:type-check
      - name: Lint
        run: pnpm examples:lint
      - name: Test
        run: pnpm examples:test

  test-nextjs-examples:
    name: "Next.js E2E: ${{ matrix.example }}"
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        example:
          - 20-nextjs-chat
          - 21-nextjs-multi-agent
          - 22-nextjs-human-in-the-loop
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: pnpm/action-setup@v4
        with:
          version: 10.30.3
          run_install: true
      - name: Build library
        run: pnpm build
      - name: Build Next.js app
        run: pnpm build
        working-directory: examples/${{ matrix.example }}
      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium
        working-directory: examples/${{ matrix.example }}
      - name: Run Playwright E2E tests
        run: pnpm test:e2e
        working-directory: examples/${{ matrix.example }}
      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-${{ matrix.example }}
          path: examples/${{ matrix.example }}/playwright-report/
          retention-days: 7
```

**Jobs summary:**

| Job                    | What it does                                                                | Runs on                               |
| ---------------------- | --------------------------------------------------------------------------- | ------------------------------------- |
| `check-all-examples`   | Format check + type-check + lint + Vitest for all examples via root scripts | ubuntu-latest                         |
| `test-nextjs-examples` | Build + Playwright E2E for each Next.js example (needs real browser)        | ubuntu-latest, matrix per Next.js app |

**Key design decisions:**

- **Root scripts** -- The `check-all-examples` job uses `pnpm examples:test`, `pnpm examples:lint`, `pnpm examples:format`, and `pnpm examples:type-check` which run across all `examples/*` workspace packages.
- **Next.js separate job** -- Playwright E2E tests require building each app and installing browsers, so they run in a separate matrix job.
- **`fail-fast: false`** -- One broken Next.js example doesn't block testing the rest.
- **Library is built first** -- `pnpm build` at the root ensures `ai-sdk-agents` (including `ai-sdk-agents/test`) is available to all examples via `workspace:*`.
- **Playwright artifacts** -- On failure, the Playwright HTML report is uploaded for debugging.
- **Triggers on `src/**` changes\*\* -- Library changes might break examples, so they re-test.

---

### `pnpm-workspace.yaml` Update Required

To make examples part of the workspace, the workspace config must include them:

```yaml
packages:
  - "."
  - "docs"
  - "examples/*"
```

### Full Implementation Order (Updated)

1. ~~**Implement `src/test/index.ts`** with all test utility exports~~ **DONE**
2. ~~**Add `./test` export** to `package.json` exports map~~ **DONE**
3. ~~**Update `vite.config.ts`** build to include the test entrypoint~~ **DONE**
4. ~~**Refactor existing library tests** to use the new shared helpers~~ **DONE**
5. ~~**Run existing tests** to verify nothing breaks (316 tests pass)~~ **DONE**
6. ~~**Update `pnpm-workspace.yaml`** to include `examples/*`~~ **DONE**
7. ~~**Build console examples** (02-19) -- each as `examples/<##-name>/` with `src/index.ts`, `src/index.test.ts`, README, .env.example~~ **ALL DONE (01-19)**
8. **Build Next.js examples** (20-22) -- each as `examples/<##-name>/` with Playwright E2E tests
9. **Create `.github/workflows/ci.yml`** -- library lint, format, type-check, tests
10. **Create `.github/workflows/ci-examples.yml`** -- auto-discover and test all examples
