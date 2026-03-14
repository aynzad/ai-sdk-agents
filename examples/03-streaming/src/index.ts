import chalk from "chalk";
import { tool } from "ai";
import { z } from "zod";
import { Agent, Runner, type StreamEvent } from "ai-sdk-agents";
import { ollama } from "ollama-ai-provider-v2";
// import { openai } from "@ai-sdk/openai";
// import { google } from "@ai-sdk/google";

const getWeather = tool({
  description: "Get the current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("The city name to get weather for"),
  }),
  execute: async ({ location }) => {
    await new Promise((r) => setTimeout(r, 500));
    const temp = Math.round(Math.random() * (35 - 5) + 5);
    const conditions = ["sunny", "cloudy", "rainy", "snowy", "windy"][
      Math.floor(Math.random() * 5)
    ];
    return { location, temp, conditions, unit: "celsius" };
  },
});

const agent = new Agent({
  name: "Streaming Agent",
  instructions:
    "You are a helpful weather assistant. Use the available tools to answer questions about weather. Provide a detailed response.",
  model: ollama(process.env.OLLAMA_MODEL ?? "qwen3:4b"),
  // model: openai("gpt-4o-mini"),
  // model: google("gemini-2.0-flash"),
  tools: { getWeather },
});

const eventLabel: Record<string, (e: StreamEvent) => string> = {
  agent_start: (e) =>
    chalk.blue(`▶ Agent started: ${(e as { agent: string }).agent}`),
  agent_end: (e) =>
    chalk.blue(`■ Agent ended: ${(e as { agent: string }).agent}`),
  tool_call_start: (e) => {
    const ev = e as { toolName: string; args: unknown };
    return chalk.yellow(
      `🔧 Tool call: ${ev.toolName}(${JSON.stringify(ev.args)})`,
    );
  },
  tool_call_end: (e) => {
    const ev = e as { toolName: string; output: unknown };
    return chalk.yellow(
      `✓ Tool result: ${ev.toolName} → ${JSON.stringify(ev.output)}`,
    );
  },
  done: () => chalk.green(`\n✅ Stream complete`),
  error: (e) => chalk.red(`✗ Error: ${(e as { error: Error }).error.message}`),
};

async function main() {
  console.log(chalk.bold.cyan(`\n🤖 AI SDK Agents - 03-Streaming`));
  console.log(chalk.cyan(`Agent: ${agent.name}`));
  console.log(chalk.dim(`Streaming response with real-time events...\n`));

  const streamResult = Runner.stream(
    agent,
    "What's the weather like in Tokyo and Paris?",
  );

  process.stdout.write(chalk.bold.green("Response: "));

  for await (const event of streamResult.events) {
    if (event.type === "text_delta") {
      if (event.delta) process.stdout.write(event.delta);
    } else if (event.type in eventLabel) {
      const formatter = eventLabel[event.type];
      if (event.type === "done") {
        console.log(formatter(event));
      } else {
        console.log(`\n${formatter(event)}`);
      }
      if (event.type === "agent_start") {
        process.stdout.write(chalk.bold.green("Response: "));
      }
    }
  }

  const result = await streamResult.result;
  console.log(
    chalk.dim(
      `\nTokens: ${result.usage.inputTokens} input + ${result.usage.outputTokens} output = ${result.usage.totalTokens} total`,
    ),
  );
  console.log(chalk.dim(`Steps: ${result.steps.length}\n`));
}

void main();
