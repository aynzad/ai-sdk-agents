import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  Agent,
  Runner,
  GuardrailTripwiredError,
  llmGuardrail,
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

const judgeModel = createMockModel();

const factCheck = llmGuardrail({
  name: "factuality-check",
  model: judgeModel,
  promptBuilder: (_ctx, input) => {
    const text = input.messages
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join(" ");
    return `Is the following text factual and appropriate? Respond with "PASS" or "FAIL".\n\nText: ${text}`;
  },
  tripWhen: (text) => text.toUpperCase().includes("FAIL"),
});

function createGuardedAgent() {
  return new Agent({
    name: "Guarded Agent",
    model: createMockModel(),
    instructions: "You are a helpful assistant.",
    outputGuardrails: [factCheck],
  });
}

describe("llm-guardrail", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should pass when judge says PASS", async () => {
    mockGenerateText
      .mockResolvedValueOnce(
        makeGenerateTextResult({ text: "The capital of France is Paris." }),
      )
      .mockResolvedValueOnce({ text: "PASS" });

    const agent = createGuardedAgent();
    const result = await Runner.run(agent, "What is the capital of France?");

    expect(result.output).toContain("Paris");
  });

  it("should trip when judge says FAIL", async () => {
    mockGenerateText
      .mockResolvedValueOnce(
        makeGenerateTextResult({ text: "The moon is made of cheese." }),
      )
      .mockResolvedValueOnce({ text: "FAIL" });

    const agent = createGuardedAgent();

    await expect(Runner.run(agent, "Tell me about the moon")).rejects.toThrow(
      GuardrailTripwiredError,
    );
  });

  it("should include guardrail name in error", async () => {
    mockGenerateText
      .mockResolvedValueOnce(
        makeGenerateTextResult({ text: "Incorrect information." }),
      )
      .mockResolvedValueOnce({ text: "FAIL - not factual" });

    const agent = createGuardedAgent();

    try {
      await Runner.run(agent, "Some prompt");
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(GuardrailTripwiredError);
      expect((error as GuardrailTripwiredError).guardrailName).toBe(
        "factuality-check",
      );
    }
  });
});
