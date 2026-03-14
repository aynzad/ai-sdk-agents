## Build Phases

Build the library in this exact order. Each phase produces working, testable code. Do not skip ahead.

### Phase 1: Types & Errors

**File:** `src/types.ts`
**Status:** ✅ Complete

This file defines every interface and error class the library uses. It imports only from `ai` (for `LanguageModel`, `ModelMessage`, etc.) and `zod` (for `z.ZodType`). All other files import their types from here.

Key types to understand before building anything:

- `AgentConfig<TContext, TOutput>` — the full agent definition shape
- `RunContext<TContext>` — the context wrapper passed everywhere
- `HandoffTarget<TContext>` — union of `AgentInstance | HandoffConfig`
- `Guardrail<TContext>` — name + execute function
- `GuardrailResult` — `{ tripwired, reason?, metadata? }`
- `RunResult<TOutput>` — final output + steps + usage + traceId
- `StreamEvent` — discriminated union of all streaming event types
- `AgentHooks` / `RunHooks` — lifecycle callback interfaces
- `TraceProcessor` / `TraceSpan` — tracing infrastructure types
- `GuardrailTripwiredError`, `MaxTurnsExceededError`, `HandoffError` — error classes

**Verify:** Types file should import ONLY from `ai` and `zod`. No internal imports. Uses `LanguageModel` (version-agnostic) and `ModelMessage` from `ai`.

---

### Phase 2: Agent Class

**File:** `src/agent/agent.ts`
**Depends on:** `types.ts`
**Status:** ✅ Complete

The Agent class is a declarative container. It holds configuration but does NOT execute anything — that's the Runner's job.

**What was implemented:**

1. **Constructor** — accepts `AgentConfig<TContext, TOutput>`, validates required fields (name, model), sets defaults (`maxToolRoundtrips: 10`).

2. **`resolveInstructions(ctx)`** — if `instructions` is a string, return it. If it's a function, call it with the RunContext and return the result. This enables dynamic system prompts that depend on runtime context.

3. **`asTool(options?)`** — wraps this agent as an `AgentTool` that another agent can call. The parent agent retains control (unlike handoffs). Uses a Zod schema with a `message: string` parameter. The execute function lazily imports `Runner` (to avoid circular deps) and calls `Runner.run(this, message)`. Returns the output as the tool result.

4. **`clone(overrides)`** — creates a new Agent with merged config. Useful for creating agent variants (e.g., same agent with different temperature or instructions).

**Key design decisions:**

- Agent is generic: `Agent<TContext, TOutput>` for full type inference
- `asTool()` uses lazy `import()` for Runner to break circular dependency
- Agent does NOT hold state — it's a pure config object. All state lives in Runner.
- `RunnerModule` interface defines the expected shape of the dynamic import for type safety
- `resolveInstructions` always returns `Promise<string>` for a uniform async API

**Test coverage (25 tests):**

- Constructor: valid config, empty name throws, missing model throws, default maxToolRoundtrips, custom maxToolRoundtrips, stores config, readonly name, optional fields
- `resolveInstructions`: static string, async function, sync function, context passthrough
- `clone`: overrides applied, original untouched, preserves non-overridden values, independent instance, inherits defaults, instanceof check
- `asTool`: returns Tool shape (parameters + description + execute), schema validation, default description, custom description, execute is callable

**Note:** `asTool().execute()` body (lazy Runner import) is untestable until Phase 6. Coverage: 88% stmts, 100% branches.

---

### Phase 3: Handoff System

**File:** `src/handoff/handoff.ts`
**Depends on:** `types.ts`
**Status:** ✅ Complete

Handoffs are the signature feature — they transfer FULL conversation control from one agent to another. The receiving agent gets the message history and takes over completely. This is fundamentally different from agent-as-a-tool (where the parent retains control).

**What was implemented:**

1. **`handoff(agent, options?)`** — factory function that creates a `HandoffConfig` from an agent + optional overrides (toolName, toolDescription, onHandoff callback, inputFilter). Simple spread merge of agent reference with options.

2. **`normalizeHandoff(target)`** — takes a `HandoffTarget` (either an AgentInstance or a HandoffConfig) and always returns a `HandoffConfig`. Uses duck-typing (`'name' in target && 'config' in target`) to detect AgentInstance without importing the Agent class. This is used internally by the Runner to handle both shorthand (`handoffs: [agentB]`) and verbose (`handoffs: [handoff(agentB, {...})]`) syntax.

3. **`handoffToTool(target)`** — converts a handoff target into an AI SDK tool definition that the LLM can call. The tool name defaults to `transfer_to_{agent_name}` (sanitized: non-alphanumeric chars replaced with underscores). The tool has a single optional `reason` parameter. The execute function returns a sentinel object `{ __handoff: true, targetAgent: name }` that the Runner detects. Returns `{ tool, config, toolName }` — the extra `toolName` makes it easy for the Runner to build the toolset map.

4. **`isHandoffResult(result)`** — type guard that checks if a tool call result is a handoff sentinel. Validates `typeof === 'object'`, non-null, `__handoff === true`, and `targetAgent` is a string.

5. **`handoffFilters`** — built-in input filter functions that control what message history the receiving agent sees:
   - `removeToolMessages` — strips `role: 'tool'` messages AND assistant messages containing tool-call content parts
   - `keepLast(n)` — keeps only the last N messages (returns `[]` for n <= 0)
   - `removeAll` — receiving agent starts with blank history
   - `keepConversation` — keeps only user/assistant messages
   - `compose(...filters)` — chains multiple filters left-to-right via reduce (zero filters = identity)

**How handoffs work at runtime (Runner's perspective):**

1. Runner converts each handoff target to a tool via `handoffToTool()`
2. These tools are added to the agent's tool set before calling `generateText`
3. If the LLM calls a handoff tool (e.g., `transfer_to_billing`), Runner detects the sentinel
4. Runner optionally applies the inputFilter to message history
5. Runner switches `currentAgent` to the handoff target
6. Next loop iteration runs with the new agent

**Key design decisions:**

- `normalizeHandoff` uses duck-typing rather than `instanceof Agent` to stay decoupled from the Agent class
- `handoffToTool` sanitizes agent names for tool naming (LLM tool names should be alphanumeric + underscores)
- `removeToolMessages` handles both `role: 'tool'` messages AND assistant messages with tool-call content parts (AI SDK represents tool calls as assistant message content)
- `compose` with zero filters acts as identity function (returns input unchanged)
- The handoff sentinel `{ __handoff: true, targetAgent }` is a plain object — no class needed
- `handoffToTool` returns `toolName` alongside `tool` and `config` for Runner convenience

**Test coverage (43 tests):**

- `handoff`: valid config creation, toolName/toolDescription/onHandoff/inputFilter overrides, agent reference preservation (6 tests)
- `normalizeHandoff`: HandoffConfig passthrough, AgentInstance wrapping, duck-typing detection (3 tests)
- `handoffToTool`: name pattern, custom toolName, default/custom description, reason parameter schema, sentinel return from execute, tool+config+toolName return, special chars in name, raw AgentInstance normalization (10 tests)
- `isHandoffResult`: valid sentinel, missing **handoff, null, undefined, string, **handoff: false, missing targetAgent (7 tests)
- `handoffFilters.removeToolMessages`: removes tool messages, removes tool-call assistants, keeps user/plain assistant, empty input (4 tests)
- `handoffFilters.keepLast`: last N, N > length, N = 0, empty input (4 tests)
- `handoffFilters.removeAll`: always empty (1 test)
- `handoffFilters.keepConversation`: keeps user/assistant, removes system/tool, empty input (3 tests)
- `handoffFilters.compose`: chaining, single filter, zero filters (identity), combined removeToolMessages + keepLast (4 tests)
- Plus 1 additional sentinel test (no reason provided)

**Coverage:** 100% stmts, 100% branches, 100% funcs, 100% lines.

**Verify:** Module imports only from `@/types`, `ai`, and `zod`. No internal cross-module imports.

---

### Phase 4: Guardrail System

**File:** `src/guardrail/guardrail.ts`
**Depends on:** `types.ts`
**Status:** ✅ Complete

Guardrails validate inputs and outputs with tripwire-based halting. When any guardrail trips, execution stops immediately by throwing `GuardrailTripwiredError`. Multiple guardrails run in parallel for performance.

**What was implemented:**

1. **`guardrail(config)`** — factory that validates and returns a `Guardrail` object. Validates that `name` is a non-empty string and `execute` is a function. Throws `Error` on invalid config.

2. **`llmGuardrail(config)`** — higher-order guardrail that uses an AI model to validate content. Accepts `{ name, model, promptBuilder, tripWhen }`. The execute function calls `promptBuilder(ctx, input)` to build a prompt, lazy-imports `generateText` from AI SDK, calls the model, and passes the result text to the `tripWhen` predicate. If `generateText` throws, treats it as a tripwire (safety-first: failures are blocked, not allowed through).

3. **`runGuardrails(guardrails, ctx, input)`** — runs all guardrails in parallel via `Promise.allSettled`. Returns on first tripwire. If a guardrail throws (execution failure), treats it as a tripwire for safety. Returns `GuardrailResult & { guardrailName? }`. Empty guardrails array returns `{ tripwired: false }`.

4. **Built-in guardrails:**
   - `keywordGuardrail({ blockedKeywords, caseSensitive? })` — scans all message content strings for blocked keywords. Default case-insensitive. Includes matched keyword in reason.
   - `maxLengthGuardrail({ maxLength })` — trips if any message content string exceeds `maxLength` characters. Boundary (exactly at limit) does not trip.
   - `regexGuardrail({ pattern, reason? })` — trips if regex matches any message content string. Uses custom reason if provided, otherwise generates a default reason mentioning the pattern.

5. **`extractTextContent(messages)` (internal)** — helper that extracts string content from `ModelMessage[]`, handling both `string` content and `ContentPart[]` arrays (extracting `type: 'text'` parts). Used by all built-in guardrails.

**Three guardrail scopes (enforced by Runner, not by guardrail module):**

- **Input guardrails** — run before the agent processes the message
- **Output guardrails** — run after the agent produces its final output
- **Tool guardrails** — (future) run on every tool invocation

**Key design decisions:**

- Guardrails run in parallel, not sequentially — first tripwire wins
- Failed guardrail execution (thrown error) = tripwire for safety
- `llmGuardrail` lazy-imports `generateText` via `await import('ai')` to avoid hard dep at module level
- Built-in guardrails are convenience wrappers — users can always use `guardrail()` directly
- Content extraction handles both `string` and `ContentPart[]` message content types, skipping non-text parts (e.g., tool-call parts)
- `runGuardrails` augments the `GuardrailResult` with `guardrailName` to identify which guardrail tripped
- `LlmGuardrailConfig` interface is exported for TypeScript consumers building custom LLM guardrails

**Test coverage (43 tests):**

- `guardrail`: valid creation, empty name throws, undefined name throws, non-function execute throws, undefined execute throws (5 tests)
- `keywordGuardrail`: case-insensitive trip, no match, caseSensitive: true no match, caseSensitive: true match, multiple keywords, empty messages, keyword in reason, empty blockedKeywords, ContentPart array scanning, non-text parts skipped, descriptive name (11 tests)
- `maxLengthGuardrail`: exceeds limit, under limit, exactly at limit, empty messages, zero maxLength, descriptive name (6 tests)
- `regexGuardrail`: pattern match, no match, custom reason, default reason, empty messages, descriptive name (6 tests)
- `llmGuardrail`: calls generateText with model+prompt, trips on predicate true, no trip on predicate false, promptBuilder receives ctx+input, generateText error = tripwire, has provided name (6 tests)
- `runGuardrails`: all pass, first tripwire with name, parallel timing, thrown errors as tripwires, empty array, single pass, single trip, metadata preserved, mixed pass/fail/error (9 tests)

**Coverage:** 100% stmts, 100% branches, 100% funcs, 100% lines.

**Verify:** Module imports only from `@/types` and `ai` (lazy). No internal cross-module imports.

---

### Phase 5: Tracing System

**File:** `src/tracing/tracing.ts`
**Depends on:** `types.ts`
**Status:** ✅ Complete

Tracing captures structured observability data for every agent run. Every LLM call, tool execution, handoff, and guardrail check is recorded as a span within a trace. Custom processors can export this data to Langfuse, Datadog, or any observability backend.

**What was implemented:**

1. **`Trace` class** — manages a single trace lifecycle:
   - Constructor takes `name` and optional `processors[]`, generates a unique `traceId`, merges per-trace processors with global processors, and notifies all via `onTraceStart`. Processor errors are try/caught — they never break the trace.
   - `span(config)` — creates a `TraceSpan` with auto-generated `spanId`, the trace's `traceId`, provided `name`, `type`, optional `parentSpanId`, `startTime = Date.now()`, and empty `attributes`. Returns a `SpanHandle` object with `setAttribute(key, value)` and `end()`.
   - `end()` — finalizes the trace, calls `onTraceEnd` on all processors. Idempotent (second call is a no-op).
   - `getSpans()` — returns a shallow copy of all completed spans.

2. **`SpanHandle`** — returned by `Trace.span()`:
   - `setAttribute(key, value)` — sets `attributes[key] = value` on the underlying span data.
   - `end()` — sets `endTime = Date.now()`, pushes span to the trace's completed list, and calls `onSpan` on all processors. Idempotent.

3. **`trace(name, fn, config?)`** — convenience function that creates a Trace, runs an async function with it, and auto-closes on completion or error. On error: creates an error span (type `'custom'`, attribute `{ error: message }`), ends it, ends the trace, then rethrows. Handles non-Error thrown values via `String(err)`.

4. **Global processor management:**
   - `addTraceProcessor(processor)` — register a global processor (module-level `Set`)
   - `removeTraceProcessor(processor)` — unregister (reference equality)
   - `clearTraceProcessors()` — remove all

5. **Built-in processors:**
   - `consoleTraceProcessor()` — logs trace start/end and span details (name, type, duration) to `console.log`. Handles undefined `endTime` gracefully with `'?'` fallback.
   - `memoryTraceProcessor()` — stores spans in a `Map<string, TraceSpan[]>` keyed by traceId, exposes `getTraces()` and `clear()`. Return type is `TraceProcessor & { getTraces(): Map<string, TraceSpan[]>; clear(): void }`.

**Key design decisions:**

- Processor errors are swallowed — every processor call (`onTraceStart`, `onSpan`, `onTraceEnd`) wrapped in try/catch. A buggy telemetry exporter must never crash the agent run.
- IDs generated with `timestamp(base36) + random(base36) + counter(base36)` for uniqueness without uuid dep. Counter guarantees uniqueness within the same millisecond.
- `end()` is idempotent on both `Trace` and `SpanHandle` — calling it twice does nothing. Prevents double-reporting.
- `getSpans()` returns a shallow copy of the array (convention-based immutability, no deep freeze).
- Processor merge happens at Trace construction time — per-trace + global processors are combined. Adding a global processor after construction does NOT affect existing traces.
- `Trace` stores `name` as a public readonly property for identification by the Runner in Phase 6.

**Langfuse integration (recipe — no library dependency):**

The `TraceProcessor` interface is designed so users can build their own exporters. Here's how to wire up Langfuse:

```typescript
import Langfuse from "langfuse";
import type { TraceProcessor, TraceSpan } from "ai-sdk-agents";

function langfuseTraceProcessor(opts: {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
}): TraceProcessor {
  const langfuse = new Langfuse({
    publicKey: opts.publicKey,
    secretKey: opts.secretKey,
    baseUrl: opts.baseUrl,
  });
  const traces = new Map<string, ReturnType<typeof langfuse.trace>>();

  return {
    onTraceStart(traceId) {
      traces.set(traceId, langfuse.trace({ id: traceId, name: traceId }));
    },
    onSpan(span) {
      const t = traces.get(span.traceId);
      if (!t) return;
      t.span({
        name: span.name,
        startTime: new Date(span.startTime),
        endTime: span.endTime ? new Date(span.endTime) : undefined,
        metadata: { type: span.type, ...span.attributes },
      });
    },
    async onTraceEnd(traceId) {
      traces.delete(traceId);
      await langfuse.flushAsync();
    },
  };
}

// Usage:
addTraceProcessor(
  langfuseTraceProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
  }),
);
```

**Test coverage (47 tests):**

- ID generation: unique traceIds, non-empty string (2 tests)
- Trace: constructor traceId, onTraceStart notification, no-processors safe, span() returns SpanHandle shape, span traceId/name/type/parentSpanId/startTime correctness, getSpans() empty/populated/copy-safety, end() processor notification + idempotency, processor error safety for onTraceStart/onTraceEnd, per-trace + global processor merge (16 tests)
- SpanHandle: setAttribute single/multiple, end() sets endTime, end() notifies processors, end() idempotent, onSpan error safety, empty initial attributes (7 tests)
- trace() convenience: auto-create/close on success, returns result, error capture as spans, error span type+attribute, end() on error, Trace instance passthrough, non-Error thrown values, optional processors config (8 tests)
- Global processor management: addTraceProcessor, removeTraceProcessor, clearTraceProcessors, remove non-registered safe, global pickup by new traces (5 tests)
- consoleTraceProcessor: onTraceStart log, onSpan log with duration, onSpan with undefined endTime, onTraceEnd log (4 tests)
- memoryTraceProcessor: store spans by traceId, getTraces(), clear(), onTraceEnd data persistence, multiple independent traces (5 tests)

**Coverage:** 100% stmts, 100% branches, 100% funcs, 100% lines.

**Verify:** Module imports only from `@/types`. No internal cross-module imports.

---

### Phase 6: Runner (Core Orchestration)

**File:** `src/runner/runner.ts`
**Depends on:** ALL other modules
**Status:** ✅ Complete

The Runner is the heart of the library. It orchestrates the full agent execution loop: invoke the model → check for final output / handoff / tool calls → execute and loop. It manages multi-agent handoffs, guardrail validation, tracing, and hooks.

---

#### Architecture & Design Decisions

- **Static class** (no instantiation) — stateless by design. All state lives in local variables within `run()`.
- **Model resolution:** `LanguageModel` instances pass through; string identifiers throw with a helpful error (provider registry is a future feature).
- **AI SDK delegation:** All LLM calls use `generateText` with `stopWhen: stepCountIs(N)` for tool loops — we don't reimplement the tool loop.
- **Handoff detection:** Works by inspecting `result.steps[].toolResults` after `generateText` returns. Tool results containing the sentinel `{ __handoff: true, targetAgent }` trigger the handoff for the NEXT turn. AI SDK executes the handoff tool (which returns the sentinel), but the actual agent switch happens between `generateText` calls.
- **Context is mutable** (turn, agent update each iteration) — intentional for simplicity.
- **Default maxTurns:** 10 (configurable via `RunConfig.maxTurns`).
- **Input type:** `run()` accepts both `string` (converted to a single user message) and `ModelMessage[]`.

---

#### Mocking Strategy for Tests

The Runner test mocks `generateText` at the module level:

```typescript
import { vi } from "vitest";

const mockGenerateText = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: mockGenerateText };
});
```

Each test scenario controls what `mockGenerateText` returns. The mock return must match AI SDK's `GenerateTextResult` shape:

```typescript
mockGenerateText.mockResolvedValue({
  text: "Hello!",
  steps: [
    {
      text: "Hello!",
      toolCalls: [],
      toolResults: [],
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    },
  ],
  toolCalls: [],
  toolResults: [],
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  finishReason: "stop",
  response: { id: "resp-1", model: "test-model", timestamp: new Date() },
});
```

For handoff scenarios, tool results contain the sentinel:

```typescript
steps: [
  {
    toolCalls: [
      {
        type: "tool-call",
        toolCallId: "tc1",
        toolName: "transfer_to_billing",
        input: {},
      },
    ],
    toolResults: [
      {
        type: "tool-result",
        toolCallId: "tc1",
        toolName: "transfer_to_billing",
        output: { __handoff: true, targetAgent: "billing" },
      },
    ],
    // ...
  },
];
```

The mock model uses the existing `createMockModel()` pattern — it's just a `LanguageModel` shape (cast via `as unknown as LanguageModel`) that gets passed through to `generateText` (which is mocked).

---

#### `Runner.run(agent, input, config?)` — Pseudocode

```
1. INITIALIZE:
   - Resolve maxTurns from config (default: 10)
   - Convert string input to ModelMessage[] if needed
   - Create messages array from input
   - Initialize: steps=[], usage={inputTokens:0,outputTokens:0,totalTokens:0}, turn=0
   - Resolve currentAgent from agent param
   - Create Trace (if tracing not disabled)
   - Build RunContext

2. FIRE hooks.onRunStart(ctx)

3. LOOP while turn < maxTurns:
   a. turn++
   b. Update ctx.agent = currentAgent.name, ctx.turn = turn

   c. FIRE RunHooks.onAgentStart(ctx), AgentHooks.onStart(ctx)

   d. TRACE: open agent span (type: 'agent')

   e. INPUT GUARDRAILS:
      - If currentAgent has inputGuardrails, run them via runGuardrails()
      - If any trips:
        → Fire RunHooks.onGuardrailTripped(ctx, result)
        → Throw GuardrailTripwiredError(guardrailName, reason, metadata)

   f. RESOLVE INSTRUCTIONS:
      - Call currentAgent.resolveInstructions(ctx) for the system prompt

   g. BUILD TOOLS:
      - Start with agent's own tools (config.tools ?? {})
      - For each handoff in agent's handoffs[]:
        → Call handoffToTool(target) → get { tool, config, toolName }
        → Add tool to toolset under toolName
        → Store toolName → handoffConfig mapping for later lookup

   h. RESOLVE MODEL:
      - Use config.model (RunConfig override) ?? agent's config.model
      - If string → throw Error('String model identifiers not yet supported...')
      - If LanguageModel instance → use directly

   i. CALL AI SDK generateText():
      - model, system: resolved instructions, messages,
        tools: merged toolset, stopWhen: stepCountIs(agent.config.maxToolRoundtrips),
        modelSettings spread (temperature, maxOutputTokens, etc.),
        abortSignal: ctx.signal

   j. ACCUMULATE USAGE:
      - usage.inputTokens += result.totalUsage.inputTokens
      - usage.outputTokens += result.totalUsage.outputTokens
      - usage.totalTokens += result.totalUsage.totalTokens

   k. RECORD TOOL STEPS from result.steps:
      - For each step in result.steps:
        - For each toolCall: record RunStep { type: 'tool_call', agent, data: toolCall }
        - For each toolResult: record RunStep { type: 'tool_result', agent, data: toolResult }

   l. CHECK FOR HANDOFFS:
      - Iterate ALL toolResults across ALL result.steps
      - For each toolResult, check isHandoffResult(toolResult.output)
      - If handoff found:
        → Look up handoffConfig from toolName → config map
        → Fire handoffConfig.onHandoff?.(ctx)
        → Fire AgentHooks.onHandoff?.(ctx, targetAgentName)
        → Fire RunHooks.onHandoff?.(ctx, currentAgent.name, targetAgentName)
        → Record RunStep { type: 'handoff', agent, data: { from, to } }
        → Apply inputFilter: messages = config.inputFilter?.(messages) ?? messages
        → Switch: currentAgent = handoffConfig.agent
        → FIRE RunHooks.onAgentEnd(ctx, ''), AgentHooks.onEnd(ctx, '')
        → TRACE: close agent span
        → continue LOOP (new agent takes over)

   m. NO HANDOFF — agent produced final output:
      - Append assistant message to messages from result.text
      - Record RunStep { type: 'message', agent, data: { text: result.text } }

   n. FIRE RunHooks.onAgentEnd(ctx, result.text), AgentHooks.onEnd(ctx, result.text)
   o. TRACE: close agent span

   p. OUTPUT GUARDRAILS:
      - If currentAgent has outputGuardrails, run them
      - Input to guardrails: assistant response messages
      - If any trips → throw GuardrailTripwiredError

   q. PARSE OUTPUT:
      - If outputSchema defined → JSON.parse(result.text) then schema.parse()
      - Otherwise → raw text as output

   r. BUILD RunResult:
      { output, agent: currentAgent.name, steps, usage, traceId: trace?.traceId }

   s. FIRE RunHooks.onRunEnd(ctx, result)
   t. TRACE: close trace
   u. RETURN RunResult

4. If loop exits without return → throw MaxTurnsExceededError(maxTurns)
```

---

#### `Runner.stream(agent, input, config?)` — v0.1 Synthetic Wrapper

For v0.1, `stream()` wraps `run()` and emits synthetic events after-the-fact. Not real token streaming.

```
1. Create a deferred result promise
2. Return StreamResult { events: asyncGenerator, result: promise }
3. In the async generator:
   a. Call Runner.run(agent, input, config)
   b. Emit 'agent_start' for the final agent
   c. For each step in result.steps:
      - 'tool_call' steps → emit 'tool_call_start' + 'tool_call_end'
      - 'handoff' steps → emit 'handoff'
   d. Emit 'text_delta' with full output text (single chunk)
   e. Emit 'agent_end'
   f. Emit 'done' with result
   g. Resolve the result promise
4. On error:
   a. Emit 'error' event
   b. Reject the result promise
```

---

#### TDD Test Plan (63 tests across 11 groups)

Tests live in `src/runner/runner.test.ts`. All tests mock `generateText` at module level.

**Group 1: Basic Execution (8 tests)**

| #   | Test name                                                        | What it verifies                                         |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | should return text output for simple agent run with string input | String input converted to user message, text returned    |
| 2   | should pass ModelMessage array input directly                    | ModelMessage[] forwarded to generateText messages        |
| 3   | should return RunResult with correct shape                       | Output has output, agent, steps, usage, traceId          |
| 4   | should use agent model when no config override                   | generateText called with agent's model                   |
| 5   | should use config model override over agent model                | RunConfig.model takes precedence                         |
| 6   | should throw helpful error for string model identifier           | `"gpt-4o"` string throws with message about unsupported  |
| 7   | should resolve static string instructions as system prompt       | System prompt in generateText matches agent instructions |
| 8   | should resolve dynamic function instructions with context        | Function called with RunContext, result used as system   |

**Group 2: Tool Execution (6 tests)**

| #   | Test name                                           | What it verifies                              |
| --- | --------------------------------------------------- | --------------------------------------------- |
| 1   | should pass agent tools to generateText             | tools arg includes agent's tools              |
| 2   | should set stopWhen from agent maxToolRoundtrips    | stopWhen set from agent config                |
| 3   | should record tool calls as steps                   | RunResult.steps contains tool_call entries    |
| 4   | should record tool results as steps                 | RunResult.steps contains tool_result entries  |
| 5   | should accumulate steps across multi-step tool loop | Multiple steps from generateText all recorded |
| 6   | should respect custom maxToolRoundtrips             | Non-default value forwarded to stopWhen       |

**Group 3: Handoff Detection & Routing (10 tests)**

| #   | Test name                                              | What it verifies                                   |
| --- | ------------------------------------------------------ | -------------------------------------------------- |
| 1   | should add handoff tools to generateText tool set      | Handoff targets converted to tools and merged      |
| 2   | should detect handoff sentinel and switch agent        | isHandoffResult sentinel triggers agent swap       |
| 3   | should run new agent in next turn after handoff        | generateText called twice with different agents    |
| 4   | should apply inputFilter to messages before next agent | Filtered messages passed to next generateText call |
| 5   | should fire onHandoff callback from HandoffConfig      | config.onHandoff invoked during handoff            |
| 6   | should record handoff as step                          | RunStep type 'handoff' with from/to data           |
| 7   | should handle sequential handoffs A→B→C                | Three agents, two handoffs, correct final agent    |
| 8   | should throw HandoffError for unknown target agent     | Missing agent in handoff map throws                |
| 9   | should auto-normalize raw AgentInstance in handoffs    | Agent passed directly (not via handoff()) works    |
| 10  | should use transfer*to*{name} tool name pattern        | Tool name matches expected convention              |

**Group 4: Input Guardrails (5 tests)**

| #   | Test name                                                       | What it verifies                               |
| --- | --------------------------------------------------------------- | ---------------------------------------------- |
| 1   | should run input guardrails before generateText                 | Guardrails executed, generateText called after |
| 2   | should throw GuardrailTripwiredError when input guardrail trips | Error thrown with correct name/reason          |
| 3   | should fire onGuardrailTripped hook before throwing             | Hook called then error thrown                  |
| 4   | should allow execution when input guardrails pass               | generateText called normally                   |
| 5   | should run multiple input guardrails in parallel                | All guardrails invoked via runGuardrails       |

**Group 5: Output Guardrails (5 tests)**

| #   | Test name                                                        | What it verifies                          |
| --- | ---------------------------------------------------------------- | ----------------------------------------- |
| 1   | should run output guardrails after final output                  | Guardrails receive assistant response     |
| 2   | should throw GuardrailTripwiredError when output guardrail trips | Error thrown after output                 |
| 3   | should pass assistant response to output guardrails              | GuardrailInput.messages contains response |
| 4   | should skip output guardrails when handoff occurs                | No output guardrail run on handoff turn   |
| 5   | should run multiple output guardrails in parallel                | All guardrails invoked                    |

**Group 6: Output Schema Parsing (4 tests)**

| #   | Test name                                        | What it verifies                   |
| --- | ------------------------------------------------ | ---------------------------------- |
| 1   | should return raw text when no outputSchema      | String output                      |
| 2   | should parse and validate JSON with outputSchema | Zod schema applied, typed output   |
| 3   | should throw on invalid JSON against schema      | Parse or validation error          |
| 4   | should type RunResult output with schema type    | TypeScript generic flows correctly |

**Group 7: Turn Management (4 tests)**

| #   | Test name                                             | What it verifies             |
| --- | ----------------------------------------------------- | ---------------------------- |
| 1   | should throw MaxTurnsExceededError when limit reached | Infinite handoff loop throws |
| 2   | should default maxTurns to 10                         | No config → 10 turns max     |
| 3   | should respect config maxTurns override               | Custom limit applied         |
| 4   | should increment turn counter each iteration          | ctx.turn matches iteration   |

**Group 8: Usage Accumulation (3 tests)**

| #   | Test name                                    | What it verifies                 |
| --- | -------------------------------------------- | -------------------------------- |
| 1   | should flow single-turn usage to RunResult   | Usage from one generateText call |
| 2   | should accumulate usage across handoff turns | Multi-agent totals summed        |
| 3   | should handle zero usage gracefully          | No tokens → zeroes in result     |

**Group 9: Hooks & Lifecycle (8 tests)**

| #   | Test name                                           | What it verifies                 |
| --- | --------------------------------------------------- | -------------------------------- |
| 1   | should fire onRunStart at beginning                 | Hook called with initial context |
| 2   | should fire onRunEnd with final result              | Hook called with RunResult       |
| 3   | should fire onAgentStart before each agent turn     | Per-turn hook                    |
| 4   | should fire onAgentEnd after each agent turn        | Per-turn hook with output        |
| 5   | should fire onHandoff with from/to names            | RunHooks.onHandoff               |
| 6   | should fire AgentHooks.onStart for current agent    | Agent-level start hook           |
| 7   | should fire AgentHooks.onEnd for current agent      | Agent-level end hook             |
| 8   | should swallow hook errors without breaking the run | Throwing hook doesn't crash      |

**Group 10: Tracing Integration (6 tests)**

| #   | Test name                                 | What it verifies                       |
| --- | ----------------------------------------- | -------------------------------------- |
| 1   | should create trace for the run           | Trace opened, traceId in result        |
| 2   | should open and close agent span per turn | Span with type 'agent' per iteration   |
| 3   | should use custom traceId from config     | TracingConfig.traceId overrides        |
| 4   | should skip tracing when disabled         | TracingConfig.enabled=false → no Trace |
| 5   | should pass traceId to RunResult          | result.traceId matches trace           |
| 6   | should notify trace processors            | Processors receive span events         |

**Group 11: Streaming — Synthetic v0.1 (4 tests)**

| #   | Test name                                                 | What it verifies                            |
| --- | --------------------------------------------------------- | ------------------------------------------- |
| 1   | should return StreamResult with events and result promise | Correct shape                               |
| 2   | should emit events in correct order                       | agent_start → text_delta → agent_end → done |
| 3   | should emit handoff events for multi-agent runs           | handoff event in stream                     |
| 4   | should resolve result promise with same output as run     | Consistency                                 |

---

#### Implementation Sub-tasks (TDD Order)

Each sub-task follows red-green-refactor. Write the tests for that group first, verify they fail, then implement.

| Order | Sub-task                                                                             | Tests             | Dependencies   |
| ----- | ------------------------------------------------------------------------------------ | ----------------- | -------------- |
| 1     | Scaffold: `src/runner/runner.ts` with empty Runner class, stub run/stream            | Group 1 tests 1-3 | None           |
| 2     | Basic run loop: model resolution, instructions, single generateText, build RunResult | Group 1 tests 4-8 | Sub-task 1     |
| 3     | Tool integration: merge tools, pass stopWhen, record tool steps                      | Group 2 (all 6)   | Sub-task 2     |
| 4     | Turn management: loop with maxTurns, counter                                         | Group 7 (all 4)   | Sub-task 2     |
| 5     | Handoff system: build handoff tools, detect sentinels, switch agents, filters        | Group 3 (all 10)  | Sub-tasks 3, 4 |
| 6     | Input guardrails: run before generateText, throw on trip                             | Group 4 (all 5)   | Sub-task 2     |
| 7     | Output guardrails: run after final output, throw on trip                             | Group 5 (all 5)   | Sub-task 5     |
| 8     | Output schema: JSON parse + Zod validate                                             | Group 6 (all 4)   | Sub-task 2     |
| 9     | Usage accumulation: sum across turns                                                 | Group 8 (all 3)   | Sub-task 5     |
| 10    | Hooks: fire all lifecycle hooks                                                      | Group 9 (all 8)   | Sub-task 5     |
| 11    | Tracing: integrate Trace/span                                                        | Group 10 (all 6)  | Sub-task 10    |
| 12    | Streaming: synthetic wrapper                                                         | Group 11 (all 4)  | Sub-task 11    |

---

#### Files Created/Modified

| File                        | Action                                         |
| --------------------------- | ---------------------------------------------- |
| `src/runner/runner.ts`      | **Created** — Runner static class (~330 lines) |
| `src/runner/runner.test.ts` | **Created** — 64 test cases across 11 groups   |
| `src/index.ts`              | **Modified** — added Runner + tracing exports  |

---

#### Key Implementation Notes

1. **Circular dependency with Agent:** `Agent.asTool()` lazy-imports `Runner` via `import('../runner/runner.js')`. The Runner imports Agent normally. This is already handled.

2. **generateText result.steps structure (AI SDK v6):** Each step has `{ text, toolCalls[], toolResults[], finishReason, usage }`. Tool calls have `{ type: 'tool-call', toolCallId, toolName, input }`. Tool results have `{ type: 'tool-result', toolCallId, toolName, output }`. Cumulative usage is in `result.totalUsage`.

3. **Handoff detection in result.steps:** After `generateText` returns, iterate `result.steps[].toolResults` and check each with `isHandoffResult(tr.output)`. First tries matching by `toolName` against the handoff map, then falls back to matching by `targetAgent` name.

4. **Message building:** The Runner maintains a `messages: ModelMessage[]` array. String input becomes `[{ role: 'user', content: input }]`. Passes `[...messages]` (snapshot) to `generateText` to avoid mutation interference. After each non-handoff turn, appends `{ role: 'assistant', content: result.text }`. On handoff, optionally filters messages via `inputFilter`.

5. **Model settings passthrough:** Spread `agent.config.modelSettings` into the `generateText` call (temperature, maxOutputTokens, etc.).

6. **AbortSignal:** Forward `config.signal` to `generateText`'s `abortSignal` parameter and to `RunContext.signal`.

7. **Barrel export update:** Added `Runner` + all tracing exports (`trace`, `Trace`, `addTraceProcessor`, `removeTraceProcessor`, `clearTraceProcessors`, `consoleTraceProcessor`, `memoryTraceProcessor`, `SpanHandle`, `SpanConfig`) to `src/index.ts`.

**Test coverage (64 tests):**

- Basic Execution: string/message input, RunResult shape, model resolution, instructions (8 tests)
- Tool Execution: tool passthrough, stopWhen, step recording (6 tests)
- Handoff Detection & Routing: sentinel detection, agent switching, filters, callbacks, A→B→C (10 tests)
- Input Guardrails: pre-execution validation, tripwire throwing, hook firing (5 tests)
- Output Guardrails: post-output validation, handoff bypass (5 tests)
- Output Schema Parsing: raw text, JSON + Zod, invalid input, typed generics (4 tests)
- Turn Management: MaxTurnsExceededError, defaults, custom maxTurns, counter (4 tests)
- Usage Accumulation: single/multi-turn, zero handling (3 tests)
- Hooks & Lifecycle: all RunHooks + AgentHooks, error swallowing (8 tests)
- Tracing Integration: Trace creation, spans, disabled, custom traceId, processors (6 tests)
- Streaming v0.1: shape, event order, handoff events, error events, result consistency (5 tests)

**Coverage:** 98.04% stmts, 100% funcs, 98.04% lines. Branch coverage lower (77.94%) due to optional chain operators and empty catch blocks in hook error swallowing.

**Verify:** Runner module imports from `@/types`, `@/handoff/handoff`, `@/guardrail/guardrail`, `@/tracing/tracing`, and `ai`.

---

### Phase 7: Barrel Exports

**File:** `src/index.ts`
**Depends on:** All modules
**Status:** ✅ Complete

The public API. Every export from this file is part of the library's contract. If it's not exported from `src/index.ts`, it's not public API.

**What was implemented:**

1. **Barrel finalization** — `src/index.ts` serves as the single entry point for the package. Imports directly from source files (no sub-module `index.ts` barrels, per project rule "never re-export stuff in index.ts files").

2. **Missing export added** — `LlmGuardrailConfig` type was exported from `guardrail/guardrail.ts` but missing from the barrel. Added for TypeScript consumers building custom LLM guardrails.

**Public API surface (19 runtime exports + 28 type exports):**

```typescript
// Agent
export { Agent } from "./agent/agent";

// Handoff
export { handoff, handoffFilters } from "./handoff/handoff";

// Guardrail
export {
  guardrail,
  llmGuardrail,
  keywordGuardrail,
  maxLengthGuardrail,
  regexGuardrail,
} from "./guardrail/guardrail";
export type { LlmGuardrailConfig } from "./guardrail/guardrail";

// Runner
export { Runner } from "./runner/runner";

// Tracing
export {
  trace,
  Trace,
  addTraceProcessor,
  removeTraceProcessor,
  clearTraceProcessors,
  consoleTraceProcessor,
  memoryTraceProcessor,
} from "./tracing/tracing";
export type { SpanHandle, SpanConfig } from "./tracing/tracing";

// Types (from types.ts)
export type {
  RunContext,
  ModelSettings,
  AgentHooks,
  AsToolOptions,
  AgentConfig,
  AgentInstance,
  HandoffConfig,
  HandoffTarget,
  GuardrailInput,
  GuardrailResult,
  Guardrail,
  TraceSpan,
  TraceProcessor,
  TracingConfig,
  RunHooks,
  RunConfig,
  RunStep,
  RunResult,
  StreamEvent,
  StreamResult,
  LanguageModel,
  ModelMessage,
  Tool,
  ToolSet,
  LanguageModelUsage,
} from "./types";

// Errors
export {
  GuardrailTripwiredError,
  MaxTurnsExceededError,
  HandoffError,
} from "./types";
```

**Deliberately excluded internals:**

- `normalizeHandoff` — used only by Runner to normalize handoff targets
- `handoffToTool` — used only by Runner to convert handoffs to AI SDK tools
- `isHandoffResult` — used only by Runner to detect handoff sentinels
- `runGuardrails` — used only by Runner to execute guardrail arrays
- `extractTextContent` — internal helper for built-in guardrails

**Key design decisions:**

- No sub-module `index.ts` barrels — imports go directly to source files (`./agent/agent`, not `./agent/index`)
- `LlmGuardrailConfig` exported as a type-only re-export (needed for custom LLM guardrails)
- `SpanHandle` and `SpanConfig` exported as types from tracing (not from `types.ts` since they are tracing-specific)
- AI SDK types (`LanguageModel`, `ModelMessage`, `Tool`, `ToolSet`, `LanguageModelUsage`) re-exported so consumers don't need to import `ai` directly for type annotations
- `src/index.ts` excluded from coverage metrics in `vitest.config.ts` (pure re-exports, no logic)
- No dedicated barrel tests — the file is pure re-exports with zero logic; the public API is already exercised by module-level tests

**Build output:**

- `dist/ai-sdk-agents.js` — ESM bundle (20.48 kB, gzip 5.18 kB)
- `dist/ai-sdk-agents.cjs` — CJS bundle (22.15 kB, gzip 5.77 kB)
- `dist/index.d.ts` — Bundled declaration file with all public types including `LlmGuardrailConfig`

**Verify:** All 239 tests pass. Build produces dual CJS/ESM bundles. `LlmGuardrailConfig` present in `dist/index.d.ts`.

---

### Phase 8: Full Streaming

**File:** `src/runner/runner.ts` (modified)
**Depends on:** Phase 6 (Runner)
**Status:** ✅ Complete

Replaced the synthetic `Runner.stream()` wrapper (which called `run()` and emitted fake events after-the-fact) with a real streaming implementation that uses AI SDK's `streamText` for token-by-token events.

**What changed:**

1. **`Runner.stream()` rewritten** — now has its own orchestration loop (parallel to `run()`) that uses `streamText` instead of `generateText`. The async generator yields events in real time as they arrive from the AI SDK's `fullStream`.

2. **Real `text_delta` events** — each token is yielded individually as it arrives from the model, not as a single blob after completion.

3. **Real `tool_call_start` / `tool_call_end` events** — emitted from `fullStream`'s `tool-call` and `tool-result` parts as they happen during the tool execution loop.

4. **Handoff detection from stream** — handoff sentinels are detected in real-time `tool-result` events from `fullStream`. Once detected, subsequent `text_delta` events for that turn are suppressed (the model may generate tokens after a handoff tool returns, but they're discarded).

5. **Full feature parity with `run()`** — the stream method supports all the same features: input/output guardrails, multi-agent handoffs with input filters, output schema parsing, hooks (all lifecycle hooks fire at the same points), tracing with agent spans, turn management with `MaxTurnsExceededError`, usage accumulation across turns.

**How it works at runtime:**

```
1. Create async generator that yields StreamEvent
2. Initialize: messages, steps, usage, tracing, context (same as run())
3. Fire hooks.onRunStart

4. LOOP while turn < maxTurns:
   a. yield 'agent_start'
   b. Run input guardrails (throw if tripped → caught as 'error' event)
   c. Resolve instructions, build tools + handoff tools, resolve model
   d. Call streamText({ model, system, messages, tools, stopWhen })
   e. Consume fullStream:
      - 'text-delta' → yield 'text_delta' (suppressed after handoff detected)
      - 'tool-call' → yield 'tool_call_start', record RunStep
      - 'tool-result' → yield 'tool_call_end', record RunStep, check handoff
   f. Await streamResult.usage for token accumulation
   g. If handoff:
      → Fire onHandoff callbacks, record step
      → yield 'handoff', yield 'agent_end'
      → Apply inputFilter, switch agent, continue loop
   h. If no handoff (final output):
      → Fire onAgentEnd hooks, yield 'agent_end'
      → Run output guardrails
      → Parse output (JSON + Zod if schema defined)
      → Build RunResult, fire onRunEnd
      → yield 'done', resolve result promise, return

5. If loop exits → throw MaxTurnsExceededError (caught as 'error' event)
```

**Key design decisions:**

- `stream()` does NOT wrap `run()` — it has its own full orchestration loop using `streamText`. This ensures real-time event delivery rather than synthetic after-the-fact events.
- `fullStream` is consumed as `AsyncIterable<FullStreamPart>` with a type cast to handle dynamic tool typing (the `TextStreamPart<TOOLS>` generic narrows differently when tools are optional).
- Text deltas are suppressed after handoff detection within the same turn. The model may continue generating after a handoff tool returns its sentinel, but those tokens are meaningless.
- Usage is accumulated via `await streamResult.totalUsage` after the full stream is consumed, matching how `run()` accumulates from `generateText().totalUsage`.
- Error handling wraps the entire while-loop in a try/catch that yields an `error` event and rejects the result promise.
- `run()` is completely untouched — both methods coexist with independent orchestration loops.

**Mocking strategy for tests:**

The test file mocks both `generateText` and `streamText` at module level:

```typescript
const { mockGenerateText, mockStreamText } = vi.hoisted(() => {
  return { mockGenerateText: vi.fn(), mockStreamText: vi.fn() };
});

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<AiModule>();
  return { ...actual, generateText: mockGenerateText, streamText: mockStreamText };
});
```

The `makeStreamTextResult()` helper creates a mock return value with:
- `fullStream` — async generator yielding `TextStreamPart`-shaped objects
- `textStream` — async generator yielding text strings
- `text`, `usage`, `steps`, `finishReason` — resolved promises
- Configurable `textDeltas` (for real token-by-token testing) and `fullStreamParts` (for tool/handoff scenarios)

**Test coverage (32 tests across 8 sub-groups):**

- Basic Streaming: StreamResult shape, real multi-token deltas, event ordering, result promise, streamText called (not generateText), model/instructions passthrough (6 tests)
- Tool Call Streaming: tool_call_start/end events from fullStream, tool steps in RunResult, tools/stopWhen passthrough, multiple tools (5 tests)
- Handoff Streaming: sentinel detection + agent switch, handoff event emission, agent_start/end per agent, inputFilter, text suppression after handoff, onHandoff callbacks (6 tests)
- Guardrails in Stream: input guardrails before streamText, error event on trip, output guardrails after text, skip on handoff turn (4 tests)
- Usage/Schema/Result: usage accumulation across handoffs, output schema parsing, zero usage, result promise rejection (4 tests)
- Turn Management/Errors: MaxTurnsExceededError as error event, streamText throw as error event, default maxTurns (3 tests)
- Hooks and Tracing: lifecycle hooks, trace with spans, hook error swallowing, tracing disabled (4 tests)

**Coverage:** 90.14% stmts, 79.37% branches, 100% funcs, 90.14% lines. Uncovered lines are empty catch blocks for hook error swallowing and optional chain operators — same pattern as `run()`.

**Files modified:**

| File | Change |
|------|--------|
| `src/runner/runner.ts` | Added `streamText`/`stepCountIs` imports, `FullStreamPart` interface, rewrote `stream()` (~200 lines) |
| `src/runner/runner.test.ts` | Added `mockStreamText` mock, `makeStreamTextResult` helper, replaced 5 synthetic tests with 32 real streaming tests |

**Build output:**

- `dist/ai-sdk-agents.js` — ESM bundle (28.72 kB, gzip 5.91 kB)
- `dist/ai-sdk-agents.cjs` — CJS bundle (30.39 kB, gzip 6.49 kB)

**Verify:** All 266 tests pass. Build produces dual CJS/ESM bundles. No public API changes (same `StreamEvent`, `StreamResult` types).

---

## Testing Strategy

- **Unit tests** for each module independently (mock AI SDK calls)
- **Integration tests** that run real agent loops with mock models
- **Test files** live next to source: `src/agent/agent.test.ts`, etc.
- **Mock model** — create a minimal `LanguageModel` mock (via `as unknown as LanguageModel` cast) that returns canned responses
- **No real API calls in CI** — all tests use mocks

---

### Phase 9: Tool Guardrails

**File:** `src/guardrail/tool-guardrail.ts`
**Depends on:** `types.ts`, `guardrail/guardrail.ts` (pattern), Runner (integration)
**Status:** ✅ Complete

Tool guardrails wrap individual function tools, running validation **before** execution (input guardrails) and **after** execution (output guardrails). They mirror the [OpenAI Agents SDK tool guardrail pattern](https://openai.github.io/openai-agents-js/guides/guardrails/) but compose on top of Vercel AI SDK.

**Key difference from agent-level guardrails:**

- **Agent guardrails** run in parallel, return `{ tripwired, reason }`, and halt the entire run
- **Tool guardrails** run sequentially per tool, return a **behavior** (`allow` / `rejectContent` / `throwException`), and can either halt or gracefully reject

**How it works with AI SDK:**

Since `generateText`/`streamText` handle tool loops internally via `stopWhen`, tool guardrails are implemented by **wrapping each tool's `execute` function** at runtime in the Runner. The wrapped execute runs input guardrails before the real execute and output guardrails after.

---

#### What was implemented

**New types in `src/types.ts`:**

- `ToolGuardrailBehavior` — discriminated union: `{ type: 'allow' }` | `{ type: 'rejectContent', message }` | `{ type: 'throwException', reason?, metadata? }`
- `ToolInputGuardrailData<TContext>` — data passed to input guardrails: `{ toolName, toolCallId, input, ctx }`
- `ToolOutputGuardrailData<TContext>` — data passed to output guardrails: `{ toolName, toolCallId, input, output, ctx }`
- `ToolInputGuardrail<TContext>` — `{ name, execute: (data) => Promise<ToolGuardrailBehavior> }`
- `ToolOutputGuardrail<TContext>` — `{ name, execute: (data) => Promise<ToolGuardrailBehavior> }`
- `ToolGuardrailTripwiredError` — error class with `guardrailName`, `toolName`, `reason?`, `metadata?`

**New module `src/guardrail/tool-guardrail.ts`:**

1. **`ToolGuardrailBehaviorFactory`** — static factory with three methods:
   - `.allow()` → `{ type: 'allow' }`
   - `.rejectContent(message)` → `{ type: 'rejectContent', message }`
   - `.throwException(reason?, metadata?)` → `{ type: 'throwException', reason?, metadata? }`

2. **`defineToolInputGuardrail(config)`** — factory that validates `name` (non-empty string) and `execute` (function). Returns a `ToolInputGuardrail`.

3. **`defineToolOutputGuardrail(config)`** — same pattern for output guardrails.

4. **`guardedTool(config)`** — creates an AI SDK `Tool` with `__toolGuardrails` metadata attached. The config extends the standard tool config with `inputGuardrails?` and `outputGuardrails?`. Does NOT wrap execute at creation time — the Runner handles wrapping at runtime when it has access to `RunContext`.

5. **`isGuardedTool(tool)`** — type guard that checks for `__toolGuardrails` property.

6. **`getToolGuardrails(tool)`** — extracts `{ inputGuardrails, outputGuardrails }` from a tool, returning empty arrays for non-guarded tools.

7. **`runToolInputGuardrails(guardrails, data)`** — sequential executor. Iterates guardrails in order; first `rejectContent` or `throwException` wins. Thrown errors are treated as `throwException` for safety. Returns `ToolGuardrailBehavior & { guardrailName? }`.

8. **`runToolOutputGuardrails(guardrails, data)`** — same sequential pattern for output guardrails.

9. **`wrapToolWithGuardrails(toolName, tool, ctx)`** — creates a new tool with the same `description`/`inputSchema` but a wrapped `execute` function that:
   - Runs input guardrails sequentially before the original execute
   - On `rejectContent`: returns the rejection message as the tool result (skips execute)
   - On `throwException`: throws `ToolGuardrailTripwiredError`
   - Calls the original `execute` if all input guardrails allow
   - Runs output guardrails sequentially on the result
   - On `rejectContent`: returns the rejection message (replaces result)
   - On `throwException`: throws `ToolGuardrailTripwiredError`

**Runner modifications (`src/runner/runner.ts`):**

1. **Tool wrapping in `run()` and `stream()`** — the tool building section now iterates agent tools and wraps any guarded tools via `wrapToolWithGuardrails` before passing to `generateText`/`streamText`. Handoff tools are NOT wrapped.

2. **Error handling for `ToolGuardrailTripwiredError`** — both `run()` and `stream()` catch this error, fire the `onGuardrailTripped` hook (with `toolName` in metadata), close the agent span, and re-throw. In `stream()`, the error is also yielded as an `error` event.

**Barrel exports (`src/index.ts`):**

```typescript
// Tool guardrail functions
export {
  defineToolInputGuardrail,
  defineToolOutputGuardrail,
  ToolGuardrailBehaviorFactory,
  guardedTool,
  isGuardedTool,
} from "./guardrail/tool-guardrail";

// Tool guardrail error
export { ToolGuardrailTripwiredError } from "./types";

// Tool guardrail types
export type {
  ToolGuardrailBehavior,
  ToolInputGuardrailData,
  ToolOutputGuardrailData,
  ToolInputGuardrail,
  ToolOutputGuardrail,
} from "./types";
```

---

#### Key design decisions

- **Per-tool guardrails (not per-agent)** — mirrors the OpenAI SDK where guardrails are attached to the tool itself via `guardedTool()`, not to the agent config. This ensures guardrails travel with the tool across different agents.
- **`guardedTool()` attaches metadata, Runner wraps at runtime** — `guardedTool()` doesn't wrap execute at creation time because it doesn't have `RunContext`. The Runner wraps tools per turn with the current context.
- **Sequential execution (not parallel)** — unlike agent guardrails which run in parallel, tool guardrails run sequentially because order matters. First `rejectContent`/`throwException` wins and skips remaining guardrails.
- **`rejectContent` is transparent to the Runner** — returns a rejection message as the tool result. The model sees this and can decide what to do. No error thrown.
- **`throwException` propagates through `generateText`** — the error escapes the tool's `execute`, causing `generateText` to throw. The Runner catches `ToolGuardrailTripwiredError` specifically to fire hooks and close spans.
- **Thrown errors in guardrail execute = `throwException`** — safety-first: if a guardrail's execute function throws, it's treated as a `throwException` behavior.
- **Handoff tools are not wrapped** — they go through the SDK's handoff path, not the tool guardrail pipeline (matching OpenAI SDK behavior).
- **`ToolGuardrailRunResult`** — extends `ToolGuardrailBehavior` with optional `guardrailName` so `wrapToolWithGuardrails` can attribute errors to the correct guardrail.

---

#### Test coverage (67 tests: 55 module + 12 runner)

**`src/guardrail/tool-guardrail.test.ts` (55 tests):**

- ToolGuardrailTripwiredError: constructor fields, name, message format, optional fields (4 tests)
- ToolGuardrailBehaviorFactory: allow, rejectContent, throwException with/without reason/metadata (5 tests)
- defineToolInputGuardrail: valid creation, empty name, missing execute, function reference (4 tests)
- defineToolOutputGuardrail: same 4 patterns (4 tests)
- guardedTool: Tool shape, __toolGuardrails, input/output storage, only-input, only-output, no guardrails (7 tests)
- isGuardedTool: guarded true, plain false, null/undefined, non-object, empty arrays (5 tests)
- getToolGuardrails: extraction, plain tool, null input (3 tests)
- runToolInputGuardrails: all allow, rejectContent skips, throwException skips, sequential order, empty, single, data passthrough, thrown error (8 tests)
- runToolOutputGuardrails: all allow, rejectContent, throwException, output in data, empty, thrown error (6 tests)
- wrapToolWithGuardrails: description/params, execution order, input reject, input throw, output reject, output throw, all allow, no guards, toolCallId passthrough (9 tests)

**`src/runner/runner.test.ts` additions (12 tests):**

- Runner.run tool guardrails: wraps guarded tools, passes plain tools, handles ToolGuardrailTripwiredError, fires onGuardrailTripped hook, handoff tools untouched, mixed tools, span closing, non-tool errors re-thrown (8 tests)
- Runner.stream tool guardrails: error event on throw, result promise rejection, wraps in streaming, fires onGuardrailTripped (4 tests)

**Coverage:** 100% stmts, 100% funcs, 100% lines for `tool-guardrail.ts`.

---

#### Files created/modified

| File | Action |
|------|--------|
| `src/types.ts` | **Modified** — added 6 types/interfaces + `ToolGuardrailTripwiredError` class (~45 lines) |
| `src/guardrail/tool-guardrail.ts` | **Created** — tool guardrail module (~200 lines) |
| `src/guardrail/tool-guardrail.test.ts` | **Created** — 55 test cases across 10 groups |
| `src/runner/runner.ts` | **Modified** — tool wrapping in both `run()` and `stream()`, error handling (~30 lines changed) |
| `src/runner/runner.test.ts` | **Modified** — added 12 test cases across 2 groups |
| `src/index.ts` | **Modified** — added tool guardrail exports (5 runtime + 5 type + 1 error class) |

**Build output:**

- `dist/ai-sdk-agents.js` — ESM bundle (34.76 kB, gzip 6.73 kB)
- `dist/ai-sdk-agents.cjs` — CJS bundle (36.60 kB, gzip 7.34 kB)

**Verify:** All 333 tests pass. Build produces dual CJS/ESM bundles. All new exports present in `dist/index.d.ts`.

---

## Future Phases

These are explicitly OUT OF SCOPE for the initial release but the architecture should not prevent them:

- **String model identifiers** — `model: 'anthropic/claude-sonnet'` string model support (the `LanguageModel` type accepts strings; the Runner currently throws but could pass them through to AI SDK's gateway)
- **MCP integration** — `@ai-sdk/mcp` tool sources on agents
- **Middleware** — `wrapLanguageModel` integration for per-agent middleware chains
- **Sessions / memory** — conversation persistence across runs
- **OpenTelemetry export** — trace processor that emits OTLP spans
- **Parallel agent execution** — run multiple agents concurrently and merge results
- **Conditional handoffs** — handoff only if a condition is met
- **Agent graph visualization** — inspect the agent topology at dev time
