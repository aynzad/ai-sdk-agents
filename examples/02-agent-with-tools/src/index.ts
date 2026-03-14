import chalk from "chalk";
import { tool } from "ai";
import { z } from "zod";
import { Agent, Runner } from "ai-sdk-agents";
// import { ollama } from "ollama-ai-provider-v2";
// import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";

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

const getTimeZone = tool({
  description: "Get the current time zone and local time for a city",
  inputSchema: z.object({
    city: z.string().describe("The city name to get the time zone for"),
  }),
  execute: ({ city }) => {
    const timezones: Record<string, { tz: string; offset: string }> = {
      tokyo: { tz: "Asia/Tokyo", offset: "UTC+9" },
      london: { tz: "Europe/London", offset: "UTC+0" },
      "new york": { tz: "America/New_York", offset: "UTC-5" },
      paris: { tz: "Europe/Paris", offset: "UTC+1" },
      sydney: { tz: "Australia/Sydney", offset: "UTC+11" },
    };
    const entry = timezones[city.toLowerCase()] ?? {
      tz: "Unknown",
      offset: "Unknown",
    };
    return { city, timezone: entry.tz, offset: entry.offset };
  },
});

const agent = new Agent({
  name: "Weather Agent",
  instructions:
    "You are a helpful weather assistant. Use the available tools to answer questions about weather and time zones. Always provide clear, concise answers.",
  // model: ollama(process.env.OLLAMA_MODEL ?? "qwen3:4b"),
  // model: openai("gpt-4o-mini"),
  model: google("gemini-2.5-flash"),
  tools: { getWeather, getTimeZone },
});

async function main() {
  console.log(chalk.bold.cyan(`\n🤖 AI SDK Agents - 02-Agent with Tools`));
  console.log(chalk.cyan(`Agent: ${agent.name}`));
  console.log(
    chalk.dim(`Tools: ${Object.keys(agent.config.tools ?? {}).join(", ")}\n`),
  );

  const result = await Runner.run(
    agent,
    "What's the weather in Tokyo and what time zone is it in?",
  );

  console.log(chalk.bold.green(`\nResult:`));
  console.log(result.output);

  const toolSteps = result.steps.filter((s) => s.type === "tool_call");
  if (toolSteps.length > 0) {
    console.log(chalk.bold.yellow(`\nTool calls (${toolSteps.length}):`));
    for (const step of toolSteps) {
      const tc = step.data as { toolName: string; input: unknown };
      console.log(
        chalk.yellow(`  → ${tc.toolName}(`),
        tc.input,
        chalk.yellow(`)`),
      );
    }
  }

  console.log(
    chalk.dim(
      `\nTokens: ${result.usage.inputTokens} input + ${result.usage.outputTokens} output = ${result.usage.totalTokens} total\n`,
    ),
  );
}

void main();
