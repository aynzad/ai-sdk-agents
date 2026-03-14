import chalk from "chalk";
import { tool } from "ai";
import { z } from "zod";
import { Agent, Runner, type RunHooks } from "ai-sdk-agents";
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

const agent = new Agent({
  name: "Hooked Agent",
  instructions:
    "You are a helpful weather assistant. Use the getWeather tool to answer weather questions. Provide concise answers.",
  // model: ollama(process.env.OLLAMA_MODEL ?? "qwen3:4b"),
  // model: openai("gpt-4o-mini"),
  model: google("gemini-2.5-flash"),
  tools: { getWeather },
  hooks: {
    onStart: (ctx) =>
      console.log(
        chalk.magenta(
          `[AgentHook] onStart: agent=${ctx.agent}, turn=${ctx.turn}`,
        ),
      ),
    onEnd: (ctx, output) =>
      console.log(
        chalk.magenta(`[AgentHook] onEnd: output="${output.slice(0, 50)}..."`),
      ),
    onToolCall: (ctx, toolName, args) =>
      console.log(
        chalk.yellow(
          `[AgentHook] onToolCall: ${toolName}(${JSON.stringify(args)})`,
        ),
      ),
    onToolResult: (ctx, toolName, result) =>
      console.log(
        chalk.yellow(
          `[AgentHook] onToolResult: ${toolName} → ${JSON.stringify(result)}`,
        ),
      ),
  },
});

const runHooks: RunHooks = {
  onRunStart: (ctx) =>
    console.log(chalk.blue(`[RunHook] onRunStart: agent=${ctx.agent}`)),
  onRunEnd: (_ctx, result) =>
    console.log(
      chalk.blue(
        `[RunHook] onRunEnd: output="${String(result.output).slice(0, 50)}..."`,
      ),
    ),
  onAgentStart: (ctx) =>
    console.log(chalk.blue(`[RunHook] onAgentStart: ${ctx.agent}`)),
  onAgentEnd: (ctx) =>
    console.log(chalk.blue(`[RunHook] onAgentEnd: ${ctx.agent}`)),
};

async function main() {
  console.log(chalk.bold.cyan(`\n🪝 AI SDK Agents - 06-Lifecycle Hooks`));
  console.log(chalk.cyan(`Agent: ${agent.name}`));
  console.log(chalk.dim(`Hooks: AgentHooks + RunHooks\n`));

  const result = await Runner.run(agent, "What's the weather in London?", {
    hooks: runHooks,
  });

  console.log(chalk.bold.green(`\nResult:`));
  console.log(result.output);
  console.log(
    chalk.dim(
      `\nTokens: ${result.usage.inputTokens} input + ${result.usage.outputTokens} output = ${result.usage.totalTokens} total\n`,
    ),
  );
}

void main();
