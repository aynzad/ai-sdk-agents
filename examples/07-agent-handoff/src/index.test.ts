import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent, Runner, handoff } from "ai-sdk-agents";
import {
  createMockModel,
  makeGenerateTextResult,
  makeHandoffStep,
} from "ai-sdk-agents/test";

const { mockGenerateText } = vi.hoisted(() => {
  return { mockGenerateText: vi.fn() };
});

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type AiModule = typeof import("ai");

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<AiModule>();
  return { ...actual, generateText: mockGenerateText };
});

const HANDOFF_TOOL = "transfer_to_Spanish_Agent";

function createAgents() {
  const spanishAgent = new Agent({
    name: "Spanish Agent",
    instructions:
      "You are a helpful assistant that always responds in Spanish.",
    model: createMockModel(),
  });

  const triageAgent = new Agent({
    name: "Triage Agent",
    instructions:
      "You are a triage agent. If the user writes in Spanish, hand off to the Spanish Agent.",
    model: createMockModel(),
    handoffs: [handoff(spanishAgent)],
  });

  return { triageAgent, spanishAgent };
}

function makeHandoffResult() {
  const step = makeHandoffStep(HANDOFF_TOOL);
  return makeGenerateTextResult({
    text: "",
    steps: [
      {
        ...step,
        toolResults: [
          {
            type: "tool-result",
            toolCallId: step.toolCalls[0].toolCallId,
            toolName: HANDOFF_TOOL,
            output: { __handoff: true, targetAgent: "Spanish Agent" },
          },
        ],
      },
    ],
  });
}

describe("agent-handoff", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should hand off to the Spanish agent", async () => {
    mockGenerateText
      .mockResolvedValueOnce(makeHandoffResult())
      .mockResolvedValueOnce(
        makeGenerateTextResult({
          text: "¡Hola! ¿Cómo puedo ayudarte con tu cuenta?",
        }),
      );

    const { triageAgent } = createAgents();
    const result = await Runner.run(triageAgent, "Hola, necesito ayuda");

    expect(result.output).toContain("Hola");
  });

  it("should respond in English without handoff", async () => {
    mockGenerateText.mockResolvedValueOnce(
      makeGenerateTextResult({ text: "Hello! How can I help you?" }),
    );

    const { triageAgent } = createAgents();
    const result = await Runner.run(triageAgent, "I need help with my account");

    expect(result.output).toContain("Hello");
    const handoffSteps = result.steps.filter((s) => s.type === "handoff");
    expect(handoffSteps).toHaveLength(0);
  });

  it("should include handoff step in result", async () => {
    mockGenerateText
      .mockResolvedValueOnce(makeHandoffResult())
      .mockResolvedValueOnce(
        makeGenerateTextResult({ text: "¡Hola! ¿Cómo puedo ayudarte?" }),
      );

    const { triageAgent } = createAgents();
    const result = await Runner.run(triageAgent, "Hola");

    const handoffSteps = result.steps.filter((s) => s.type === "handoff");
    expect(handoffSteps.length).toBeGreaterThan(0);
  });

  it("should report the final agent name", async () => {
    mockGenerateText
      .mockResolvedValueOnce(makeHandoffResult())
      .mockResolvedValueOnce(
        makeGenerateTextResult({ text: "¡Hola! Soy el agente en español." }),
      );

    const { triageAgent } = createAgents();
    const result = await Runner.run(triageAgent, "Hola, ayuda por favor");

    expect(result.agent).toBe("Spanish Agent");
  });
});
