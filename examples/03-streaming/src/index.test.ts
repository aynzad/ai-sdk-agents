import { describe, it, expect, vi, beforeEach } from "vitest";
import { tool } from "ai";
import { z } from "zod";
import { Agent, Runner, type StreamEvent } from "ai-sdk-agents";
import { createMockModel, makeStreamTextResult } from "ai-sdk-agents/test";

const { mockStreamText } = vi.hoisted(() => {
  return { mockStreamText: vi.fn() };
});

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type AiModule = typeof import("ai");

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<AiModule>();
  return { ...actual, streamText: mockStreamText };
});

const getWeather = tool({
  description: "Get the current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("The city name to get weather for"),
  }),
  execute: ({ location }) => ({
    location,
    temp: 22,
    conditions: "sunny",
    unit: "celsius",
  }),
});

function createStreamingAgent() {
  return new Agent({
    name: "Streaming Agent",
    model: createMockModel(),
    instructions:
      "You are a helpful weather assistant. Use the available tools to answer questions about weather.",
    tools: { getWeather },
  });
}

describe("streaming", () => {
  beforeEach(() => {
    mockStreamText.mockReset();
  });

  it("should return a StreamResult with events and result promise", () => {
    mockStreamText.mockReturnValue(makeStreamTextResult());
    const agent = createStreamingAgent();
    const streamResult = Runner.stream(agent, "Hello");

    expect(streamResult).toHaveProperty("events");
    expect(streamResult).toHaveProperty("result");
    expect(streamResult.result).toBeInstanceOf(Promise);
  });

  it("should emit text_delta events with correct deltas", async () => {
    mockStreamText.mockReturnValue(
      makeStreamTextResult({
        textDeltas: ["The ", "weather ", "in ", "Tokyo ", "is ", "sunny."],
      }),
    );

    const agent = createStreamingAgent();
    const streamResult = Runner.stream(agent, "What's the weather in Tokyo?");

    const deltas: string[] = [];
    for await (const event of streamResult.events) {
      if (event.type === "text_delta") {
        deltas.push(event.delta);
      }
    }

    expect(deltas).toEqual([
      "The ",
      "weather ",
      "in ",
      "Tokyo ",
      "is ",
      "sunny.",
    ]);
  });

  it("should emit events in order: agent_start, text_deltas, agent_end, done", async () => {
    mockStreamText.mockReturnValue(
      makeStreamTextResult({ textDeltas: ["Hello", " world"] }),
    );

    const agent = createStreamingAgent();
    const streamResult = Runner.stream(agent, "Hello");

    const eventTypes: string[] = [];
    for await (const event of streamResult.events) {
      eventTypes.push(event.type);
    }

    expect(eventTypes).toEqual([
      "agent_start",
      "text_delta",
      "text_delta",
      "agent_end",
      "done",
    ]);
  });

  it("should resolve result promise with complete RunResult after stream ends", async () => {
    mockStreamText.mockReturnValue(
      makeStreamTextResult({ textDeltas: ["Hello", "!"] }),
    );

    const agent = createStreamingAgent();
    const streamResult = Runner.stream(agent, "Hello");

    for await (const _event of streamResult.events) {
      // drain
    }

    const result = await streamResult.result;
    expect(result.output).toBe("Hello!");
    expect(result.usage).toBeDefined();
    expect(result.steps).toBeDefined();
  });

  it("should include agent name in text_delta events", async () => {
    mockStreamText.mockReturnValue(
      makeStreamTextResult({ textDeltas: ["Hi"] }),
    );

    const agent = createStreamingAgent();
    const streamResult = Runner.stream(agent, "Hello");

    const agents: string[] = [];
    for await (const event of streamResult.events) {
      if (event.type === "text_delta") {
        agents.push(event.agent);
      }
    }

    expect(agents).toEqual(["Streaming Agent"]);
  });

  it("should emit tool_call_start and tool_call_end for tool usage", async () => {
    mockStreamText.mockReturnValue(
      makeStreamTextResult({
        fullStreamParts: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "getWeather",
            input: { location: "Tokyo" },
          },
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "getWeather",
            output: { location: "Tokyo", temp: 22, conditions: "sunny" },
          },
          { type: "text-delta", delta: "It's sunny in Tokyo." },
          {
            type: "finish",
            finishReason: "stop",
            totalUsage: {
              inputTokens: 10,
              outputTokens: 5,
              totalTokens: 15,
            },
          },
        ],
      }),
    );

    const agent = createStreamingAgent();
    const streamResult = Runner.stream(agent, "What's the weather in Tokyo?");

    const events: StreamEvent[] = [];
    for await (const event of streamResult.events) {
      events.push(event);
    }

    const toolStart = events.find((e) => e.type === "tool_call_start");
    expect(toolStart).toBeDefined();
    if (toolStart?.type === "tool_call_start") {
      expect(toolStart.toolName).toBe("getWeather");
      expect(toolStart.args).toEqual({ location: "Tokyo" });
    }

    const toolEnd = events.find((e) => e.type === "tool_call_end");
    expect(toolEnd).toBeDefined();
    if (toolEnd?.type === "tool_call_end") {
      expect(toolEnd.toolName).toBe("getWeather");
    }
  });

  it("should reconstruct full text from text_delta events", async () => {
    mockStreamText.mockReturnValue(
      makeStreamTextResult({
        textDeltas: ["The ", "weather ", "is ", "22°C."],
      }),
    );

    const agent = createStreamingAgent();
    const streamResult = Runner.stream(agent, "What's the weather?");

    let fullText = "";
    for await (const event of streamResult.events) {
      if (event.type === "text_delta") {
        fullText += event.delta;
      }
    }

    expect(fullText).toBe("The weather is 22°C.");
  });
});
