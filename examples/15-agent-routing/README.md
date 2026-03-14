# 15 - Agent Routing

Demonstrates a triage/routing pattern where a triage agent detects the language of the user's message and hands off to the appropriate language-specific agent.

## Key Concepts

- `handoff()` for declaring multiple handoff targets
- Language detection as a routing mechanism
- `Agent` with multiple `handoffs` for routing decisions
- `RunResult.agent` to verify which agent handled the request

## Run

```bash
pnpm start
```

## Test

```bash
pnpm test
```
