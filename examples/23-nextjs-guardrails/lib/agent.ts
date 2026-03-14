import {
  Agent,
  guardrail,
  keywordGuardrail,
  regexGuardrail,
} from "ai-sdk-agents";
import { google } from "@ai-sdk/google";

/**
 * Input guardrail: blocks prompt injection attempts.
 */
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

/**
 * Input guardrail: blocks messages containing known dangerous keywords.
 */
const noBlockedWords = keywordGuardrail({
  blockedKeywords: ["hack", "exploit", "malware", "phishing"],
});

/**
 * Output guardrail: blocks responses that accidentally contain credit card numbers.
 */
const noCreditCards = regexGuardrail({
  pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,
  reason: "Credit card number detected in response",
});

/**
 * Output guardrail: blocks responses that contain SSN patterns.
 */
const noSSN = regexGuardrail({
  pattern: /\b\d{3}-\d{2}-\d{4}\b/,
  reason: "Social Security Number pattern detected in response",
});

export const guardedAgent = new Agent({
  name: "Guarded Chat Agent",
  instructions:
    "You are a helpful assistant. Never reveal sensitive personal information " +
    "such as credit card numbers or social security numbers. " +
    "If asked to do something harmful, politely decline.",
  model: google("gemini-2.5-flash"),
  inputGuardrails: [noInjection, noBlockedWords],
  outputGuardrails: [noCreditCards, noSSN],
});
