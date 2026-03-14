import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent, Runner } from "ai-sdk-agents";
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

describe("Chat Agent with Runner", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should run agent and return a response via Runner.run()", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: "Hello! How can I help you today?",
      }),
    );

    const agent = new Agent({
      name: "Chat Agent",
      model: createMockModel(),
      instructions:
        "You are a helpful, friendly assistant. Respond concisely and clearly.",
    });

    const result = await Runner.run(agent, "Hello!");
    expect(result.output).toContain("Hello");
    expect(result.agent).toBe("Chat Agent");
  });

  it("should pass instructions as system prompt to the model", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: "Response" }),
    );

    const instructions =
      "You are a helpful, friendly assistant. Respond concisely and clearly.";

    const agent = new Agent({
      name: "Chat Agent",
      model: createMockModel(),
      instructions,
    });

    await Runner.run(agent, "Hi");

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.system).toBe(instructions);
  });

  it("should include usage information in the RunResult", async () => {
    const customUsage = {
      inputTokens: 25,
      outputTokens: 15,
      totalTokens: 40,
    };
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: "Here is my response.",
        usage: customUsage,
        totalUsage: customUsage,
        steps: [
          {
            text: "Here is my response.",
            toolCalls: [],
            toolResults: [],
            finishReason: "stop" as const,
            usage: customUsage,
          },
        ],
      }),
    );

    const agent = new Agent({
      name: "Chat Agent",
      model: createMockModel(),
      instructions: "Be helpful.",
    });

    const result = await Runner.run(agent, "Test");
    expect(result.usage.inputTokens).toBe(25);
    expect(result.usage.outputTokens).toBe(15);
    expect(result.usage.totalTokens).toBe(40);
    expect(result.steps.length).toBeGreaterThanOrEqual(1);
  });
});
