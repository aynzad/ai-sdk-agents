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

describe("human-in-the-loop agent", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should respond to a record lookup request", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: "I found record #123: Acme Corporation, contact@acme.com, active status.",
      }),
    );

    const agent = new Agent({
      name: "Database Agent",
      model: createMockModel(),
      instructions: "You are a helpful database assistant.",
    });

    const result = await Runner.run(agent, "Look up record #123");
    expect(result.output).toContain("Acme");
  });

  it("should use correct system instructions", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: "Response" }),
    );

    const instructions =
      "You are a helpful database assistant. The updateRecord tool requires human approval.";

    const agent = new Agent({
      name: "Database Agent",
      model: createMockModel(),
      instructions,
    });

    await Runner.run(agent, "Hi");

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.system).toContain("database assistant");
    expect(call.system).toContain("human approval");
  });
});
