import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent, Runner, handoff } from "ai-sdk-agents";
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

describe("multi-agent customer service", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should create a triage agent with handoffs", () => {
    const faqAgent = new Agent({
      name: "FAQ Agent",
      model: createMockModel(),
      instructions: "You answer FAQ questions.",
    });

    const bookingAgent = new Agent({
      name: "Booking Agent",
      model: createMockModel(),
      instructions: "You handle booking changes.",
    });

    const triageAgent = new Agent({
      name: "Triage Agent",
      model: createMockModel(),
      instructions: "You route users to the right agent.",
      handoffs: [handoff(faqAgent), handoff(bookingAgent)],
    });

    expect(triageAgent.name).toBe("Triage Agent");
    expect(triageAgent.config.handoffs).toHaveLength(2);
  });

  it("should respond to a simple greeting", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: "Hello! Welcome to our airline. How can I help you today?",
      }),
    );

    const triageAgent = new Agent({
      name: "Triage Agent",
      model: createMockModel(),
      instructions: "You are a customer service triage agent.",
    });

    const result = await Runner.run(triageAgent, "Hi there!");
    expect(result.output).toContain("Hello");
  });
});
