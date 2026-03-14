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

describe("Human-in-the-loop Agent", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should create an agent with getRecord tool and onToolCall hook", () => {
    const onToolCall = vi.fn();

    const agent = new Agent({
      name: "Database Agent",
      model: createMockModel(),
      instructions: "You are a database assistant.",
      tools: { getRecord: {} as never },
      hooks: { onToolCall },
    });

    expect(agent.name).toBe("Database Agent");
    expect(agent.config.hooks).toBeDefined();
    expect(agent.config.hooks).toHaveProperty("onToolCall");
    expect(agent.config.tools).toHaveProperty("getRecord");
  });

  it("should store clientTools separately from server tools", () => {
    const agent = new Agent({
      name: "Database Agent",
      model: createMockModel(),
      instructions: "You are a database assistant.",
      tools: { getRecord: {} as never },
      clientTools: { updateRecord: {} as never },
    });

    expect(agent.config.tools).toHaveProperty("getRecord");
    expect(agent.config.tools).not.toHaveProperty("updateRecord");
    expect(agent.config.clientTools).toHaveProperty("updateRecord");
    expect(agent.config.clientTools).not.toHaveProperty("getRecord");
  });

  it("should respond to a record lookup via Runner.run()", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: "Found record #123: Acme Corporation, active status, balance $15,250.",
      }),
    );

    const agent = new Agent({
      name: "Database Agent",
      model: createMockModel(),
      instructions: "You are a database assistant.",
    });

    const result = await Runner.run(agent, "Look up record #123");
    expect(result.output).toContain("Acme");
    expect(result.agent).toBe("Database Agent");
  });

  it("should use correct system instructions referencing human approval", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: "How can I help?" }),
    );

    const instructions =
      "You are a database assistant. The updateRecord tool requires human approval.";

    const agent = new Agent({
      name: "Database Agent",
      model: createMockModel(),
      instructions,
    });

    await Runner.run(agent, "Hi");

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.system).toContain("human approval");
  });
});
