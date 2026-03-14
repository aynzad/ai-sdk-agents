# 11 - Tool Guardrails

Tool-level guardrails that validate inputs before execution and outputs after execution.

## Concepts

- **`guardedTool()`** — creates an AI SDK tool with attached guardrail metadata
- **`defineToolInputGuardrail()`** — defines a guardrail that runs before tool execution
- **`defineToolOutputGuardrail()`** — defines a guardrail that runs after tool execution
- **`ToolGuardrailBehaviorFactory`** — factory for guardrail decisions: `allow()`, `rejectContent(msg)`, `throwException(reason)`
- **`isGuardedTool()`** — type guard to check if a tool has guardrails attached

## What This Example Does

1. Defines an **input guardrail** that blocks SQL injection patterns
2. Defines an **output guardrail** that blocks PII (SSN patterns) from tool results
3. Creates a guarded database query tool with both guardrails attached
4. Runs the agent and demonstrates guardrail protection

## Running

```bash
pnpm install
pnpm start
```

## Testing

```bash
pnpm test
```
