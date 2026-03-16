import {
  Agent,
  guardrail,
  keywordGuardrail,
  regexGuardrail,
  guardedTool,
  defineToolInputGuardrail,
  defineToolOutputGuardrail,
  ToolGuardrailBehaviorFactory,
} from "ai-sdk-agents";
import { google } from "@ai-sdk/google";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Agent-level guardrails (input & output)
// ---------------------------------------------------------------------------

const noInjection = guardrail({
  name: "no-injection",
  execute: (_ctx, input) => {
    const text = input.messages
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join(" ")
      .toLowerCase();
    const suspicious =
      text.includes("ignore all previous") ||
      text.includes("ignore your instructions") ||
      text.includes("disregard your system");
    return Promise.resolve({
      tripwired: suspicious,
      reason: suspicious ? "Potential prompt injection detected" : undefined,
    });
  },
});

const noBlockedWords = keywordGuardrail({
  blockedKeywords: ["hack", "exploit", "malware", "phishing"],
});

const noCreditCards = regexGuardrail({
  pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,
  reason: "Credit card number detected in response",
});

const noSSN = regexGuardrail({
  pattern: /\b\d{3}-\d{2}-\d{4}\b/,
  reason: "Social Security Number pattern detected in response",
});

// ---------------------------------------------------------------------------
// Tool-level guardrails (guarded tool)
// ---------------------------------------------------------------------------

const noSqlInjection = defineToolInputGuardrail({
  name: "no-sql-injection",
  execute: ({ input }) => {
    const raw = JSON.stringify(input).toLowerCase();
    const suspicious = /('|--|;|drop\s|delete\s|insert\s|union\s)/i.test(raw);
    return Promise.resolve(
      suspicious
        ? ToolGuardrailBehaviorFactory.throwException(
            "SQL injection attempt blocked",
          )
        : ToolGuardrailBehaviorFactory.allow(),
    );
  },
});

const noPiiInOutput = defineToolOutputGuardrail({
  name: "no-pii-in-tool-output",
  execute: ({ output }) => {
    const text = JSON.stringify(output);
    const hasSSN = /\b\d{3}-\d{2}-\d{4}\b/.test(text);
    return Promise.resolve(
      hasSSN
        ? ToolGuardrailBehaviorFactory.rejectContent(
            "Account data redacted — contains sensitive PII.",
          )
        : ToolGuardrailBehaviorFactory.allow(),
    );
  },
});

const MOCK_ACCOUNTS: Record<
  string,
  { name: string; email: string; plan: string }
> = {
  alice: { name: "Alice Johnson", email: "alice@example.com", plan: "Premium" },
  bob: { name: "Bob Smith", email: "bob@example.com", plan: "Free" },
  charlie: {
    name: "Charlie Lee",
    email: "charlie@example.com",
    plan: "Business",
  },
};

const lookupAccount = guardedTool({
  description: "Look up a customer account by name. Returns account details.",
  inputSchema: z.object({
    query: z.string().describe("Customer name to search for"),
  }),
  execute: ({ query }) => {
    const key = Object.keys(MOCK_ACCOUNTS).find((k) =>
      query.toLowerCase().includes(k),
    );
    return Promise.resolve(
      key
        ? { found: true as const, account: MOCK_ACCOUNTS[key] }
        : {
            found: false as const,
            message: `No account found for "${query}".`,
          },
    );
  },
  inputGuardrails: [noSqlInjection],
  outputGuardrails: [noPiiInOutput],
});

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export const guardedAgent = new Agent({
  name: "Guarded Chat Agent",
  instructions:
    "You are a helpful assistant with access to a customer account lookup tool. " +
    "Never reveal sensitive personal information such as credit card numbers or social security numbers. " +
    "If asked to do something harmful, politely decline. " +
    "Use the lookupAccount tool when users ask about customer accounts.",
  model: google("gemini-2.5-flash"),
  tools: { lookupAccount },
  inputGuardrails: [noInjection, noBlockedWords],
  outputGuardrails: [noCreditCards, noSSN],
});
