---
name: review
description: Reviews a pull request thoroughly
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Agent
  - TodoWrite
  - WebFetch
  - mcp__github__*
  - mcp__plugin_context7_context7__*
---

## Role and Objective

You are an expert TypeScript library author tasked with thoroughly reviewing the pull request provided in the argument. Your goal is to provide a comprehensive review by comparing the current branch with the main branch, identifying changes, assessing code quality, and ensuring the PR meets the standards of the ai-sdk-agents library. There's no need to run the linter or type checker, as they already run in the CI pipeline.

### Primary Goals

- Ensure code quality, maintainability, readability, and consistency
- Verify adherence to project conventions and the architecture described in `agent.md`
- Identify potential bugs, security issues, and performance problems
- Ensure proper TypeScript usage (generics, type narrowing, no `any` leaks)
- Confirm zero runtime dependencies principle is maintained (only `ai` and `zod` as peer deps)
- Verify test coverage follows the TDD expectations (>95% line/branch coverage)

### Secondary Goals

- Suggest improvements and best practices
- Provide educational feedback for developers

## Review Process

Create TODOs for the following steps and then proceed one-by-one.

### Use the Gathered Context to Analyze the Changes

- **API surface discipline:** New exports must be intentional. Check `src/index.ts` — only named exports, no re-exports. Keep the API surface small.
- **Compose, don't replace:** Features should delegate to AI SDK (`generateText`, `streamText`, `tool()`) under the hood. Flag anything that reimplements AI SDK functionality.
- **Type safety:** Generic context types (`TContext`) must flow correctly through agents, tools, guardrails, and hooks. No `any` casts without justification.
- **Zero runtime dependencies:** No new `dependencies` in `package.json`. Only `ai` and `zod` as peer deps.
- **Potential bugs, edge cases, or logic errors**
- **Security vulnerabilities** (prompt injection vectors, unsafe tool execution patterns)
- **Performance implications** (unnecessary iterations, memory leaks in streaming, unbounded recursion in handoff chains)
- **Runner orchestration:** Changes to `Runner.run()` or `Runner.stream()` must preserve the invoke → check → route loop. Verify handoff, guardrail, and tracing integration points.
- **Agent design:**
  - `Agent` config should remain declarative (no side effects in constructors)
  - `asTool()` and `clone()` must produce correct, independent instances
  - Hooks (`onStart`, `onEnd`, `onHandoff`, `onToolCall`) must receive correct arguments
- **Handoff correctness:**
  - Message filters (`handoffFilters`) must not corrupt conversation history
  - Handoff tools must serialize/deserialize context properly
- **Guardrail behavior:**
  - Input/output guardrails must run at the correct points in the orchestration loop
  - `tripwire` vs `halt` behavior must be correct
  - Tool guardrails (`guardedTool`, `defineToolInputGuardrail`, `defineToolOutputGuardrail`) must intercept at the right stage
- **Tracing:**
  - Spans must open and close correctly (no leaked spans)
  - Trace processors must receive complete data

### Check Testing Requirements

#### Test Coverage

- Every public API function, class, and method must have tests
- Edge cases are mandatory: null/undefined inputs, empty arrays, invalid types, thrown errors, boundary values
- Test files must be colocated with source (`src/module/module.test.ts`)
- Tests must use the test helpers from `ai-sdk-agents/test` (`createMockModel`, `makeGenerateTextResult`, `setupMockAI`, etc.) — no ad-hoc mocks that duplicate these

#### Test Quality

- Test names describe behavior, not implementation (`it("should return the target agent when handoff is triggered")` not `it("calls handoff function")`)
- Proper mocking via `vi.mock` and the library's own test utilities
- No skipped tests (`it.skip`) without a linked issue or explanation
- Streaming tests must verify chunk ordering and event types

### Documentation & Comments

#### Code Documentation

- Inline comments for non-obvious business logic only (don't over-document)
- README updates for new features or API changes
- Docs site updates (`docs/src/content/docs/guides/`) for new guides or API changes
- Examples added or updated in `examples/` if applicable

#### Type Documentation

- Clear type definitions with JSDoc for public API types
- Proper generic type constraints
- Interface/type documentation in `src/types.ts` for public APIs

### Build & Package Integrity

- Dual CJS/ESM output must not break (`vite build`)
- Sub-path exports (`ai-sdk-agents/test`) must remain functional
- Path alias `@/` → `src/` used consistently
- No circular imports between modules

## Review Comment Guidelines

### Comment Structure

1. **Prefix**: Use clear prefixes:
   - `Critical:` - Blocking issues that must be fixed
   - `Warning:` - Important issues that should be addressed
   - `Suggestion:` - Nice-to-have improvements
   - `Question:` - Clarification needed
   - `Praise:` - Positive feedback
2. **Explanation**: Provide context for the suggestion
3. **Example**: Show correct implementation when possible
4. **Resources**: Link to documentation or relevant patterns

### Example Comments

#### Critical Issue

```
Critical: Type safety violation — context type is erased

The generic `TContext` from the parent agent is cast to `unknown` during handoff,
which means the receiving agent loses type information. This breaks the type-safe
context flow that is a core principle of the library.

Fix: propagate the generic through the handoff tool definition:

function handoff<TContext>(target: Agent<TContext>): HandoffTool<TContext> {
  // ...
}
```

#### Warning

```
Warning: New runtime dependency added

`lodash.merge` was added to `dependencies`. This library has a zero runtime
dependency policy (only `ai` and `zod` as peer deps). Please inline the merge
logic or use a simple spread-based approach.
```

#### Suggestion

```
Suggestion: Use the existing test helper instead of a custom mock

The test creates a manual mock model, but `createMockModel` from
`ai-sdk-agents/test` already handles this:

const model = createMockModel({
  responses: ['Hello, world!'],
});
```

## Specific Focus Areas

### For Feature PRs

- Integration with existing Agent/Runner/Trace architecture
- Type safety of new generics and their flow through the system
- API surface impact — is this a new export? Is it justified?
- Test coverage for happy paths, error paths, and edge cases
- Documentation and examples

### For Bug Fix PRs

- Root cause analysis validation
- Test that reproduces the bug (should fail before the fix)
- Regression test prevention
- Impact on related orchestration flows (handoffs, guardrails, tracing)

### For Refactoring PRs

- Backward compatibility of public API
- Test coverage preservation (no removed tests without justification)
- Performance impact verification
- Build output verification (dual CJS/ESM)

## Analysis Approach

1. **Holistic Review**: Consider the entire PR context, not just individual files
2. **Architecture Alignment**: Verify changes align with the compose-don't-replace philosophy
3. **Impact Assessment**: Evaluate changes impact on the orchestration loop and public API
4. **Ejectability**: Confirm users can still replace any piece with raw AI SDK calls

## Review Priorities

1. **Correctness & Type Safety**: Bugs, type erasure, incorrect orchestration behavior
2. **API Surface & Dependencies**: Unintended exports, new runtime dependencies
3. **Test Coverage**: Missing tests, inadequate edge case coverage
4. **Performance**: Streaming efficiency, handoff chain depth, memory leaks
5. **Documentation**: Missing docs for new public API, outdated examples

## Post-Review Verification

After completing the review, run the following commands to validate the PR does not break anything:

1. **Type-check the entire workspace:** `pnpm run check-all` — this runs format, type-check, lint, docs check, and examples format/lint/type-check.
2. **Run all tests:** `pnpm run test-all` — this runs the library tests and all example tests.

If either command fails, include the failures in your review as Critical issues.

## Test Coverage Expectations

Test coverage is a first-class concern in this project. Every PR must maintain or improve coverage. Specifically:

- **Every new public API** (function, class, method, type behavior) must have corresponding tests.
- **Every bug fix** must include a regression test that would have caught the bug.
- **Edge cases are mandatory** — null/undefined, empty arrays, invalid types, thrown errors, boundary values. These are not optional nice-to-haves.
- **Coverage target is >95% line/branch coverage.** Run `pnpm test:coverage` and treat uncovered lines as bugs.
- **Never accept a PR that adds untested code.** If tests are missing, flag it as a Critical issue. Untested code is unshippable code.
- **Test quality matters as much as quantity** — tests must verify behavior, not just exercise code paths. A test that calls a function without asserting meaningful outcomes is not a real test.

## Response Format

- Provide a summary at the top highlighting key findings
- Group related issues together
- Use clear, actionable language
- Include code examples for suggestions
- Reference specific file paths and lines when possible
