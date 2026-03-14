import { describe, it, expect, vi, beforeEach } from "vitest";
import { tool } from "ai";
import { z } from "zod";
import { Agent, Runner } from "ai-sdk-agents";
import {
  createMockModel,
  makeGenerateTextResult,
  makeToolCallStep,
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

const getTimeZone = tool({
  description: "Get the current time zone and local time for a city",
  inputSchema: z.object({
    city: z.string().describe("The city name to get the time zone for"),
  }),
  execute: ({ city }) => ({
    city,
    timezone: "Asia/Tokyo",
    offset: "UTC+9",
  }),
});

function createWeatherAgent() {
  return new Agent({
    name: "Weather Agent",
    model: createMockModel(),
    instructions:
      "You are a helpful weather assistant. Use the available tools to answer questions about weather and time zones.",
    tools: { getWeather, getTimeZone },
  });
}

describe("agent-with-tools", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should call the weather tool and return a response", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: "The weather in Tokyo is 22°C and sunny.",
        steps: [
          makeToolCallStep(
            "getWeather",
            { location: "Tokyo" },
            {
              location: "Tokyo",
              temp: 22,
              conditions: "sunny",
              unit: "celsius",
            },
          ),
          {
            text: "The weather in Tokyo is 22°C and sunny.",
            toolCalls: [],
            toolResults: [],
            finishReason: "stop" as const,
            usage: { inputTokens: 20, outputTokens: 15, totalTokens: 35 },
          },
        ],
      }),
    );

    const agent = createWeatherAgent();
    const result = await Runner.run(agent, "What's the weather in Tokyo?");

    expect(result.output).toContain("Tokyo");
    expect(result.output).toContain("22");
  });

  it("should call the timezone tool and return a response", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: "Tokyo is in the Asia/Tokyo time zone (UTC+9).",
        steps: [
          makeToolCallStep(
            "getTimeZone",
            { city: "Tokyo" },
            { city: "Tokyo", timezone: "Asia/Tokyo", offset: "UTC+9" },
          ),
          {
            text: "Tokyo is in the Asia/Tokyo time zone (UTC+9).",
            toolCalls: [],
            toolResults: [],
            finishReason: "stop" as const,
            usage: { inputTokens: 20, outputTokens: 15, totalTokens: 35 },
          },
        ],
      }),
    );

    const agent = createWeatherAgent();
    const result = await Runner.run(agent, "What time zone is Tokyo in?");

    expect(result.output).toContain("Tokyo");
    expect(result.output).toContain("UTC+9");
  });

  it("should include tool call steps in the result", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: "The weather in Tokyo is 22°C and sunny.",
        steps: [
          makeToolCallStep(
            "getWeather",
            { location: "Tokyo" },
            {
              location: "Tokyo",
              temp: 22,
              conditions: "sunny",
              unit: "celsius",
            },
          ),
          {
            text: "The weather in Tokyo is 22°C and sunny.",
            toolCalls: [],
            toolResults: [],
            finishReason: "stop" as const,
            usage: { inputTokens: 20, outputTokens: 15, totalTokens: 35 },
          },
        ],
      }),
    );

    const agent = createWeatherAgent();
    const result = await Runner.run(agent, "What's the weather in Tokyo?");

    const toolCallSteps = result.steps.filter((s) => s.type === "tool_call");
    expect(toolCallSteps.length).toBeGreaterThan(0);

    const tc = toolCallSteps[0].data as { toolName: string; input: unknown };
    expect(tc.toolName).toBe("getWeather");
  });

  it("should pass tools to the model via generateText", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: "It's sunny in Tokyo." }),
    );

    const agent = createWeatherAgent();
    await Runner.run(agent, "What's the weather?");

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.tools).toBeDefined();
    expect(call.tools).toHaveProperty("getWeather");
    expect(call.tools).toHaveProperty("getTimeZone");
  });
});
