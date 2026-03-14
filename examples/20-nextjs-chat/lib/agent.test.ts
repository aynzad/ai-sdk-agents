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

describe("chat agent", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should respond to a simple message", async () => {
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
    expect(result.output).toContain("help");
  });

  it("should use the correct system instructions", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: "Response" }),
    );

    const agent = new Agent({
      name: "Chat Agent",
      model: createMockModel(),
      instructions:
        "You are a helpful, friendly assistant. Respond concisely and clearly.",
    });

    await Runner.run(agent, "Hi");

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.system).toContain("helpful");
    expect(call.system).toContain("friendly");
  });
});
