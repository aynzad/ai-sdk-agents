import { describe, it, expect, vi, beforeEach } from "vitest";
import { handoffFilters } from "ai-sdk-agents";
import type { ModelMessage } from "ai-sdk-agents";
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

const sampleMessages: ModelMessage[] = [
  { role: "user", content: "Hello" },
  { role: "assistant", content: "Hi there!" },
  {
    role: "assistant",
    content: [
      {
        type: "tool-call",
        toolCallId: "1",
        toolName: "test",
        input: {},
      },
    ],
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "1",
        toolName: "test",
        output: { type: "text" as const, value: "ok" },
      },
    ],
  },
  { role: "user", content: "Thanks" },
  { role: "assistant", content: "You are welcome!" },
];

describe("handoffFilters", () => {
  it("removeToolMessages should filter out tool messages", () => {
    const result = handoffFilters.removeToolMessages(sampleMessages);

    expect(result.every((m) => m.role !== "tool")).toBe(true);
    expect(
      result.every((m) => {
        if (m.role !== "assistant" || !Array.isArray(m.content)) return true;
        return !m.content.some((p) => "type" in p && p.type === "tool-call");
      }),
    ).toBe(true);
    expect(result).toHaveLength(4);
  });

  it("keepLast should keep only the last N messages", () => {
    const filter = handoffFilters.keepLast(2);
    const result = filter(sampleMessages);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(sampleMessages[4]);
    expect(result[1]).toBe(sampleMessages[5]);
  });

  it("keepConversation should keep only user and assistant messages", () => {
    const result = handoffFilters.keepConversation(sampleMessages);

    result.forEach((m) => {
      expect(["user", "assistant"]).toContain(m.role);
    });
    expect(result.some((m) => m.role === "tool")).toBe(false);
  });

  it("removeAll should return empty array", () => {
    expect(handoffFilters.removeAll(sampleMessages)).toEqual([]);
  });

  it("compose should chain filters left-to-right", () => {
    const composed = handoffFilters.compose(
      // eslint-disable-next-line @typescript-eslint/unbound-method
      handoffFilters.removeToolMessages,
      handoffFilters.keepLast(2),
    );
    const result = composed(sampleMessages);

    expect(result).toHaveLength(2);
    expect(result.every((m) => m.role !== "tool")).toBe(true);
  });
});

describe("handoff-with-filters integration", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should hand off with filtered messages", async () => {
    const handoffToolName = "transfer_to_Specialist_Agent";

    mockGenerateText
      .mockResolvedValueOnce(
        makeGenerateTextResult({
          text: "",
          steps: [
            {
              text: "",
              toolCalls: [
                {
                  type: "tool-call",
                  toolCallId: "tc1",
                  toolName: handoffToolName,
                  input: {},
                },
              ],
              toolResults: [
                {
                  type: "tool-result",
                  toolCallId: "tc1",
                  toolName: handoffToolName,
                  output: {
                    __handoff: true,
                    targetAgent: "Specialist Agent",
                  },
                },
              ],
              finishReason: "tool-calls" as const,
              usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        makeGenerateTextResult({
          text: "I can help with database indexing.",
        }),
      );

    const specialistAgent = new Agent({
      name: "Specialist Agent",
      instructions: "You are a specialist.",
      model: createMockModel(),
    });

    const triageAgent = new Agent({
      name: "Triage Agent",
      instructions: "You are a triage agent.",
      model: createMockModel(),
      handoffs: [
        handoff(specialistAgent, {
          inputFilter: handoffFilters.compose(
            // eslint-disable-next-line @typescript-eslint/unbound-method
            handoffFilters.removeToolMessages,
            handoffFilters.keepLast(3),
          ),
        }),
      ],
    });

    const result = await Runner.run(triageAgent, "Help with indexing");

    expect(result.output).toBe("I can help with database indexing.");
    expect(result.agent).toBe("Specialist Agent");
  });
});
