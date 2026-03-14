import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent, Runner, type RunContext } from "ai-sdk-agents";
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

interface UserPreferences {
  language: string;
  expertiseLevel: "beginner" | "intermediate" | "expert";
}

function createAdaptiveAgent() {
  return new Agent<UserPreferences>({
    name: "Adaptive Assistant",
    model: createMockModel(),
    instructions: (ctx: RunContext<UserPreferences>) => {
      const { language, expertiseLevel } = ctx.context;
      return `Respond in ${language}. Level: ${expertiseLevel}.`;
    },
  });
}

describe("dynamic-instructions", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should pass beginner-level instructions to the model", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: "A REST API is like a waiter..." }),
    );

    const agent = createAdaptiveAgent();
    await Runner.run(agent, "Explain REST APIs.", {
      context: { language: "English", expertiseLevel: "beginner" },
    });

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.system).toContain("English");
    expect(call.system).toContain("beginner");
  });

  it("should pass expert-level instructions to the model", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: "REST is a stateless architecture..." }),
    );

    const agent = createAdaptiveAgent();
    await Runner.run(agent, "Explain REST APIs.", {
      context: { language: "English", expertiseLevel: "expert" },
    });

    const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.system).toContain("expert");
  });

  it("should produce different instructions for different contexts", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: "Response" }),
    );

    const agent = createAdaptiveAgent();

    await Runner.run(agent, "Hello", {
      context: { language: "French", expertiseLevel: "beginner" },
    });
    const call1 = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;

    await Runner.run(agent, "Hello", {
      context: { language: "Spanish", expertiseLevel: "expert" },
    });
    const call2 = mockGenerateText.mock.calls[1][0] as Record<string, unknown>;

    expect(call1.system).toContain("French");
    expect(call2.system).toContain("Spanish");
    expect(call1.system).not.toBe(call2.system);
  });

  it("should return the agent response correctly", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: "Simple explanation here." }),
    );

    const agent = createAdaptiveAgent();
    const result = await Runner.run(agent, "Explain REST.", {
      context: { language: "English", expertiseLevel: "beginner" },
    });

    expect(result.output).toBe("Simple explanation here.");
  });
});
