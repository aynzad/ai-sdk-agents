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

const FRENCH_HANDOFF = "transfer_to_French_Agent";
const GERMAN_HANDOFF = "transfer_to_German_Agent";
const ENGLISH_HANDOFF = "transfer_to_English_Agent";

function createAgents() {
  const model = createMockModel();

  const englishAgent = new Agent({
    name: "English Agent",
    instructions: "You are a helpful assistant that responds in English.",
    model,
  });

  const frenchAgent = new Agent({
    name: "French Agent",
    instructions: "You are a helpful assistant that always responds in French.",
    model,
  });

  const germanAgent = new Agent({
    name: "German Agent",
    instructions: "You are a helpful assistant that always responds in German.",
    model,
  });

  const triageAgent = new Agent({
    name: "Triage Agent",
    instructions:
      "You detect the language of the user's message and hand off to the appropriate agent.",
    model,
    handoffs: [
      handoff(englishAgent),
      handoff(frenchAgent),
      handoff(germanAgent),
    ],
  });

  return { triageAgent, englishAgent, frenchAgent, germanAgent };
}

function makeHandoffResult(toolName: string, targetAgent: string) {
  const step = makeHandoffStep(toolName);
  return makeGenerateTextResult({
    text: "",
    steps: [
      {
        ...step,
        toolResults: [
          {
            type: "tool-result",
            toolCallId: step.toolCalls[0].toolCallId,
            toolName,
            output: { __handoff: true, targetAgent },
          },
        ],
      },
    ],
  });
}

describe("agent-routing", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should route French input to French Agent", async () => {
    mockGenerateText
      .mockResolvedValueOnce(makeHandoffResult(FRENCH_HANDOFF, "French Agent"))
      .mockResolvedValueOnce(
        makeGenerateTextResult({
          text: "Bonjour! Comment puis-je vous aider?",
        }),
      );

    const { triageAgent } = createAgents();
    const result = await Runner.run(triageAgent, "Bonjour, comment ça va?");

    expect(result.output).toContain("Bonjour");
    expect(result.agent).toBe("French Agent");
  });

  it("should route German input to German Agent", async () => {
    mockGenerateText
      .mockResolvedValueOnce(makeHandoffResult(GERMAN_HANDOFF, "German Agent"))
      .mockResolvedValueOnce(
        makeGenerateTextResult({ text: "Hallo! Wie kann ich Ihnen helfen?" }),
      );

    const { triageAgent } = createAgents();
    const result = await Runner.run(triageAgent, "Hallo, wie geht es Ihnen?");

    expect(result.output).toContain("Hallo");
    expect(result.agent).toBe("German Agent");
  });

  it("should route English input to English Agent", async () => {
    mockGenerateText
      .mockResolvedValueOnce(
        makeHandoffResult(ENGLISH_HANDOFF, "English Agent"),
      )
      .mockResolvedValueOnce(
        makeGenerateTextResult({ text: "Hello! How can I help you today?" }),
      );

    const { triageAgent } = createAgents();
    const result = await Runner.run(triageAgent, "Hello, how are you?");

    expect(result.output).toContain("Hello");
    expect(result.agent).toBe("English Agent");
  });
});
