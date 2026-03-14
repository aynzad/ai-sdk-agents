import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  Agent,
  Runner,
  GuardrailTripwiredError,
  keywordGuardrail,
  maxLengthGuardrail,
  regexGuardrail,
} from "ai-sdk-agents";
import { createMockModel, makeGenerateTextResult } from "ai-sdk-agents/test";

const { mockGenerateText } = vi.hoisted(() => {
  return { mockGenerateText: vi.fn() };
});

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type AiModule = typeof import("ai");

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<AiModule>();
  return { ...actual, generateText: mockGenerateText };
});

const noBlockedWords = keywordGuardrail({
  blockedKeywords: ["hack", "exploit", "malware"],
});

const lengthLimit = maxLengthGuardrail({ maxLength: 500 });

const noCreditCards = regexGuardrail({
  pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,
  reason: "Credit card number detected",
});

function createSafeAgent() {
  return new Agent({
    name: "Safe Agent",
    model: createMockModel(),
    instructions: "You are a helpful assistant.",
    inputGuardrails: [noBlockedWords],
    outputGuardrails: [lengthLimit, noCreditCards],
  });
}

describe("keyword-guardrail", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should trip on blocked keywords", async () => {
    const agent = createSafeAgent();

    await expect(
      Runner.run(agent, "How do I hack into a system?"),
    ).rejects.toThrow(GuardrailTripwiredError);
  });

  it("should pass on safe input", async () => {
    mockGenerateText.mockResolvedValueOnce(
      makeGenerateTextResult({ text: "It is sunny today." }),
    );

    const agent = createSafeAgent();
    const result = await Runner.run(agent, "What is the weather today?");

    expect(result.output).toContain("sunny");
  });

  it("should trip on long output", async () => {
    const longText = "a".repeat(501);
    mockGenerateText.mockResolvedValueOnce(
      makeGenerateTextResult({ text: longText }),
    );

    const agent = createSafeAgent();

    await expect(
      Runner.run(agent, "Tell me a very long story"),
    ).rejects.toThrow(GuardrailTripwiredError);
  });

  it("should trip on credit card pattern", async () => {
    mockGenerateText.mockResolvedValueOnce(
      makeGenerateTextResult({
        text: "Your card number is 4111-1111-1111-1111.",
      }),
    );

    const agent = createSafeAgent();

    await expect(Runner.run(agent, "Show my card info")).rejects.toThrow(
      GuardrailTripwiredError,
    );
  });

  it("should pass when all guardrails are satisfied", async () => {
    mockGenerateText.mockResolvedValueOnce(
      makeGenerateTextResult({ text: "Hello! How can I help you?" }),
    );

    const agent = createSafeAgent();
    const result = await Runner.run(agent, "Hi there");

    expect(result.output).toBe("Hello! How can I help you?");
  });
});
