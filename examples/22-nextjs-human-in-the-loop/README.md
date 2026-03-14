# nextjs-human-in-the-loop

An approval workflow where tool calls require user confirmation before executing. Built with Next.js App Router, the AI SDK `useChat` hook, and `addToolOutput` for human-in-the-loop interactions.

## What it demonstrates

- Client-side tool without `execute` (requires human approval)
- `addToolOutput` to provide tool results after user confirmation
- `sendAutomaticallyWhen` with `lastAssistantMessageIsCompleteWithToolCalls`
- Approval card UI with approve/reject buttons
- Typed tool parts (`tool-updateRecord`, `tool-getRecord`)
- Resumable agent execution after approval

## Setup

```bash
pnpm install
cp .env.example .env
# Fill in at least one provider API key in .env
```

## Run

```bash
pnpm dev
```

Open [http://localhost:3022](http://localhost:3022) in your browser.

## Test

Unit tests (mocked LLM, no API key needed):

```bash
pnpm test
```

E2E tests (Playwright):

```bash
pnpm test:e2e
```

## Lint & Format

```bash
pnpm lint
pnpm format
```
