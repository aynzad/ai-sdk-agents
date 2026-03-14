# 08 - Handoff with Filters

Demonstrates handoff message filters that control what conversation context a receiving agent sees during a handoff.

## Filters

- **`removeToolMessages`** — strips tool-call and tool-result messages
- **`keepLast(n)`** — keeps only the last N messages
- **`keepConversation`** — keeps only user and assistant messages
- **`removeAll`** — clears all messages
- **`compose`** — chains multiple filters left-to-right

## Run

```bash
pnpm install
pnpm start
```

## Test

```bash
pnpm test
```
