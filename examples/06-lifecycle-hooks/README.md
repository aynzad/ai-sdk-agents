# 06 - Lifecycle Hooks

Demonstrates how to observe and react to agent lifecycle events using hooks.

## AgentHooks

Attached to an agent via `hooks` in `AgentConfig`. Fire for that specific agent:

- **onStart** — called when the agent begins its turn
- **onEnd** — called when the agent finishes its turn with output
- **onToolCall** — called before a tool executes
- **onToolResult** — called after a tool returns a result

## RunHooks

Passed to `Runner.run()` via `RunConfig.hooks`. Fire for the entire run:

- **onRunStart** — called once at the beginning of a run
- **onRunEnd** — called once when the run completes with the final result
- **onAgentStart** — called each time an agent begins a turn
- **onAgentEnd** — called each time an agent completes a turn

## Running

```bash
pnpm start
```

## Testing

```bash
pnpm test
```
