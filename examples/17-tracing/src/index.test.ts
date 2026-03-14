import { describe, it, expect, vi, beforeEach } from "vitest";
import { tool } from "ai";
import { z } from "zod";
import {
  Agent,
  Runner,
  consoleTraceProcessor,
  memoryTraceProcessor,
} from "ai-sdk-agents";
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

function createWeatherAgent() {
  return new Agent({
    name: "Weather Agent",
    model: createMockModel(),
    instructions: "You are a helpful weather assistant.",
    tools: { getWeather },
  });
}

describe("tracing", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("consoleTraceProcessor should log trace events", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: "It is sunny in Berlin." }),
    );

    const logSpy = vi.spyOn(console, "log");
    const processor = consoleTraceProcessor();

    const agent = createWeatherAgent();
    await Runner.run(agent, "Weather in Berlin?", {
      tracing: { processors: [processor] },
    });

    const calls = logSpy.mock.calls.map((c) => c.join(" "));
    expect(calls.some((c) => c.includes("Started"))).toBe(true);
    expect(calls.some((c) => c.includes("Ended"))).toBe(true);

    logSpy.mockRestore();
  });

  it("memoryTraceProcessor should collect spans", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: "It is sunny in Berlin." }),
    );

    const processor = memoryTraceProcessor();
    const agent = createWeatherAgent();
    await Runner.run(agent, "Weather in Berlin?", {
      tracing: { processors: [processor] },
    });

    const traces = processor.getTraces();
    expect(traces.size).toBeGreaterThan(0);

    const allSpans = [...traces.values()].flat();
    expect(allSpans.length).toBeGreaterThan(0);
    expect(allSpans[0]).toHaveProperty("traceId");
    expect(allSpans[0]).toHaveProperty("spanId");
    expect(allSpans[0]).toHaveProperty("name");
  });

  it("should include traceId in result", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: "Sunny day." }),
    );

    const processor = memoryTraceProcessor();
    const agent = createWeatherAgent();
    const result = await Runner.run(agent, "Weather?", {
      tracing: { processors: [processor] },
    });

    expect(result.traceId).toBeDefined();
  });

  it("memoryTraceProcessor.clear should reset traces", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({ text: "Cloudy." }),
    );

    const processor = memoryTraceProcessor();
    const agent = createWeatherAgent();
    await Runner.run(agent, "Weather?", {
      tracing: { processors: [processor] },
    });

    expect(processor.getTraces().size).toBeGreaterThan(0);

    processor.clear();
    expect(processor.getTraces().size).toBe(0);
  });
});
