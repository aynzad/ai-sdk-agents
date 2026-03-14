import { describe, it, expect, vi, beforeEach } from "vitest";
import { tool } from "ai";
import { z } from "zod";
import { Agent, Runner, type AgentHooks, type RunHooks } from "ai-sdk-agents";
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
    temp: 18,
    conditions: "cloudy",
    unit: "celsius",
  }),
});

function createHookedAgent(hooks?: AgentHooks) {
  return new Agent({
    name: "Hooked Agent",
    model: createMockModel(),
    instructions: "You are a helpful weather assistant.",
    tools: { getWeather },
    hooks,
  });
}

describe("lifecycle-hooks", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should fire onStart and onEnd agent hooks", async () => {
    const startCalls: string[] = [];
    const endCalls: string[] = [];

    const agent = createHookedAgent({
      onStart: (ctx) => {
        startCalls.push(ctx.agent);
      },
      onEnd: (_ctx, output) => {
        endCalls.push(output);
      },
    });

    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: "It is 18°C and cloudy in London.",
      }),
    );

    await Runner.run(agent, "What's the weather in London?");

    expect(startCalls).toEqual(["Hooked Agent"]);
    expect(endCalls).toEqual(["It is 18°C and cloudy in London."]);
  });

  it("should fire onToolCall and onToolResult agent hooks", async () => {
    const toolCalls: Array<{ name: string; args: unknown }> = [];
    const toolResults: Array<{ name: string; result: unknown }> = [];

    const agent = createHookedAgent({
      onToolCall: (_ctx, toolName, args) => {
        toolCalls.push({ name: toolName, args });
      },
      onToolResult: (_ctx, toolName, result) => {
        toolResults.push({ name: toolName, result });
      },
    });

    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: "It is 18°C and cloudy in London.",
        steps: [
          makeToolCallStep(
            "getWeather",
            { location: "London" },
            {
              location: "London",
              temp: 18,
              conditions: "cloudy",
              unit: "celsius",
            },
          ),
          {
            text: "It is 18°C and cloudy in London.",
            toolCalls: [],
            toolResults: [],
            finishReason: "stop" as const,
            usage: { inputTokens: 20, outputTokens: 15, totalTokens: 35 },
          },
        ],
      }),
    );

    await Runner.run(agent, "What's the weather in London?");

    expect(toolCalls.length).toBeGreaterThan(0);
    expect(toolCalls[0].name).toBe("getWeather");
    expect(toolResults.length).toBeGreaterThan(0);
    expect(toolResults[0].name).toBe("getWeather");
  });

  it("should fire onRunStart and onRunEnd run hooks", async () => {
    const onRunStart = vi.fn();
    const onRunEnd = vi.fn();

    const agent = createHookedAgent();

    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: "Cloudy skies in London." }),
    );

    await Runner.run(agent, "Weather in London?", {
      hooks: { onRunStart, onRunEnd } satisfies RunHooks,
    });

    expect(onRunStart).toHaveBeenCalledOnce();
    expect(onRunStart.mock.calls[0][0]).toMatchObject({
      agent: "Hooked Agent",
    });

    expect(onRunEnd).toHaveBeenCalledOnce();
    const resultArg = onRunEnd.mock.calls[0][1] as { output: string };
    expect(resultArg.output).toBe("Cloudy skies in London.");
  });

  it("should fire onAgentStart and onAgentEnd run hooks", async () => {
    const onAgentStart = vi.fn();
    const onAgentEnd = vi.fn();

    const agent = createHookedAgent();

    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: "London weather report." }),
    );

    await Runner.run(agent, "Weather in London?", {
      hooks: { onAgentStart, onAgentEnd } satisfies RunHooks,
    });

    expect(onAgentStart).toHaveBeenCalledOnce();
    expect(onAgentStart.mock.calls[0][0]).toMatchObject({
      agent: "Hooked Agent",
    });

    expect(onAgentEnd).toHaveBeenCalledOnce();
    expect(onAgentEnd.mock.calls[0][1]).toBe("London weather report.");
  });

  it("should fire hooks in correct order", async () => {
    const order: string[] = [];

    const agent = createHookedAgent({
      onStart: () => {
        order.push("agent:onStart");
      },
      onEnd: () => {
        order.push("agent:onEnd");
      },
    });

    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: "Done." }),
    );

    const runHooks: RunHooks = {
      onRunStart: () => {
        order.push("run:onRunStart");
      },
      onRunEnd: () => {
        order.push("run:onRunEnd");
      },
      onAgentStart: () => {
        order.push("run:onAgentStart");
      },
      onAgentEnd: () => {
        order.push("run:onAgentEnd");
      },
    };

    await Runner.run(agent, "Hello", { hooks: runHooks });

    expect(order).toEqual([
      "run:onRunStart",
      "run:onAgentStart",
      "agent:onStart",
      "run:onAgentEnd",
      "agent:onEnd",
      "run:onRunEnd",
    ]);
  });
});
