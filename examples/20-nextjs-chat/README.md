# nextjs-chat

A basic chat interface powered by ai-sdk-agents with streaming responses. Built with Next.js App Router and the AI SDK `useChat` hook.

## What it demonstrates

- Next.js App Router API route (`app/api/chat/route.ts`)
- `streamText` with `toUIMessageStreamResponse()` on the server
- AI SDK `useChat` hook on the client
- Server-to-client streaming
- Tailwind CSS styling with dark mode support

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

Open [http://localhost:3020](http://localhost:3020) in your browser.

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
