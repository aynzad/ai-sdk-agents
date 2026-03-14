import { describe, it, expect, vi, beforeEach } from "vitest";
import { tool } from "ai";
import { z } from "zod";
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

const FAQ_HANDOFF = "transfer_to_FAQ_Agent";
const BOOKING_HANDOFF = "transfer_to_Booking_Agent";

const lookupFAQ = tool({
  description: "Look up frequently asked questions about the airline",
  inputSchema: z.object({
    topic: z.string().describe("The FAQ topic to look up"),
  }),
  execute: ({ topic }) => `FAQ answer for ${topic}`,
});

const getSeatInfo = tool({
  description: "Get current seat map and availability for a flight",
  inputSchema: z.object({}),
  execute: () => ({
    currentSeat: "14B",
    available: ["2A", "7F"],
  }),
});

const changeSeat = tool({
  description: "Change the passenger's seat assignment",
  inputSchema: z.object({
    newSeat: z.string().describe("The new seat to assign"),
  }),
  execute: ({ newSeat }) => ({
    success: true,
    newSeat,
  }),
});

function createAgents() {
  const model = createMockModel();

  const faqAgent = new Agent({
    name: "FAQ Agent",
    instructions: "You are an airline FAQ specialist.",
    model,
    tools: { lookupFAQ },
  });

  const bookingAgent = new Agent({
    name: "Booking Agent",
    instructions: "You are a booking specialist for seat changes.",
    model,
    tools: { getSeatInfo, changeSeat },
  });

  const triageAgent = new Agent({
    name: "Triage Agent",
    instructions:
      "You are a customer service triage agent. Route FAQ questions to FAQ Agent and booking questions to Booking Agent.",
    model,
    handoffs: [handoff(faqAgent), handoff(bookingAgent)],
  });

  return { triageAgent, faqAgent, bookingAgent };
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

describe("customer-service-bot", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should route FAQ questions to FAQ Agent", async () => {
    mockGenerateText
      .mockResolvedValueOnce(makeHandoffResult(FAQ_HANDOFF, "FAQ Agent"))
      .mockResolvedValueOnce(
        makeGenerateTextResult({
          text: "Carry-on bags are limited to 10kg. Checked bags up to 23kg are included.",
        }),
      );

    const { triageAgent } = createAgents();
    const result = await Runner.run(triageAgent, "What is the baggage policy?");

    expect(result.output).toContain("10kg");
    expect(result.agent).toBe("FAQ Agent");
  });

  it("should route booking questions to Booking Agent", async () => {
    mockGenerateText
      .mockResolvedValueOnce(
        makeHandoffResult(BOOKING_HANDOFF, "Booking Agent"),
      )
      .mockResolvedValueOnce(
        makeGenerateTextResult({
          text: "Your current seat is 14B. Available seats: 2A, 7F, 12A.",
        }),
      );

    const { triageAgent } = createAgents();
    const result = await Runner.run(triageAgent, "I want to change my seat");

    expect(result.output).toContain("14B");
    expect(result.agent).toBe("Booking Agent");
  });

  it("triage agent should respond directly for simple greetings", async () => {
    mockGenerateText.mockResolvedValueOnce(
      makeGenerateTextResult({
        text: "Hello! Welcome to our airline. How can I help you today?",
      }),
    );

    const { triageAgent } = createAgents();
    const result = await Runner.run(triageAgent, "Hi there!");

    expect(result.output).toContain("Hello");
    const handoffSteps = result.steps.filter((s) => s.type === "handoff");
    expect(handoffSteps).toHaveLength(0);
  });

  it("should include tools in agent configuration", async () => {
    mockGenerateText.mockResolvedValue(makeGenerateTextResult({ text: "OK" }));

    const { faqAgent, bookingAgent } = createAgents();

    await Runner.run(faqAgent, "test");
    const faqCall = mockGenerateText.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(faqCall.tools).toHaveProperty("lookupFAQ");

    mockGenerateText.mockClear();
    await Runner.run(bookingAgent, "test");
    const bookingCall = mockGenerateText.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(bookingCall.tools).toHaveProperty("getSeatInfo");
    expect(bookingCall.tools).toHaveProperty("changeSeat");
  });
});
