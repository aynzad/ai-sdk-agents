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

describe("hello-world", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should run the agent and return a response", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: "Code flows like stream\nBits align in harmony\nSilicon dreams wake",
      }),
    );

    const agent = new Agent({
      name: "Haiku Agent",
      model: createMockModel(),
      instructions: "You respond only in haiku.",
    });

    const result = await Runner.run(agent, "Write a haiku about programming.");
    expect(result.output).toContain("Code flows");
  });

  it("should include usage information in the result", async () => {
    const customUsage = {
      inputTokens: 20,
      outputTokens: 10,
      totalTokens: 30,
    };
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: "Hello!",
        usage: customUsage,
        totalUsage: customUsage,
        steps: [
          {
            text: "Hello!",
            toolCalls: [],
            toolResults: [],
            finishReason: "stop" as const,
            usage: customUsage,
          },
        ],
      }),
    );

    const agent = new Agent({
      name: "Test Agent",
      model: createMockModel(),
      instructions: "Be helpful.",
    });

    const result = await Runner.run(agent, "Hello");
    expect(result.usage.inputTokens).toBe(20);
    expect(result.usage.outputTokens).toBe(10);
    expect(result.usage.totalTokens).toBe(30);
  });

  it("should pass instructions to the model as system prompt", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: "Haiku response" }),
    );

    const agent = new Agent({
      name: "Haiku Agent",
      model: createMockModel(),
      instructions: "You respond only in haiku.",
    });

    await Runner.run(agent, "Write a haiku.");

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.system).toBe("You respond only in haiku.");
  });
});
