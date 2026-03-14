import chalk from "chalk";
import { tool } from "ai";
import { z } from "zod";
import {
  Agent,
  Runner,
  consoleTraceProcessor,
  memoryTraceProcessor,
} from "ai-sdk-agents";
import { ollama } from "ollama-ai-provider-v2";

const getWeather = tool({
  description: "Get the current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("The city name to get weather for"),
  }),
  execute: ({ location }) => {
    const temp = Math.round(Math.random() * (35 - 5) + 5);
    const conditions = ["sunny", "cloudy", "rainy", "snowy", "windy"][
      Math.floor(Math.random() * 5)
    ];
    return { location, temp, conditions, unit: "celsius" };
  },
});

const agent = new Agent({
  name: "Weather Agent",
  instructions:
    "You are a helpful weather assistant. Use the getWeather tool to answer questions about weather.",
  model: ollama(process.env.OLLAMA_MODEL ?? "qwen3:4b"),
  tools: { getWeather },
});

async function main() {
  console.log(chalk.bold.cyan("\n🔍 AI SDK Agents - 17-Tracing"));
  console.log(
    chalk.dim("Demonstrating consoleTraceProcessor & memoryTraceProcessor\n"),
  );

  const consoleProcessor = consoleTraceProcessor();
  const memoryProcessor = memoryTraceProcessor();

  const result = await Runner.run(agent, "What's the weather in Berlin?", {
    tracing: { processors: [consoleProcessor, memoryProcessor] },
  });

  console.log(chalk.bold.green("\nResult:"));
  console.log(result.output);

  const traces = memoryProcessor.getTraces();
  console.log(chalk.bold.yellow(`\nCollected traces: ${traces.size}`));
  for (const [traceId, spans] of traces) {
    console.log(chalk.yellow(`  Trace ${traceId}: ${spans.length} span(s)`));
    for (const span of spans) {
      const duration =
        span.endTime !== undefined ? `${span.endTime - span.startTime}ms` : "?";
      console.log(chalk.dim(`    → ${span.name} (${span.type}) ${duration}`));
    }
  }

  if (result.traceId) {
    console.log(chalk.dim(`\nTrace ID: ${result.traceId}`));
  }

  console.log(
    chalk.dim(
      `\nTokens: ${result.usage.inputTokens} input + ${result.usage.outputTokens} output = ${result.usage.totalTokens} total\n`,
    ),
  );
}

void main();
