import chalk from "chalk";
import { Agent, Runner } from "ai-sdk-agents";
// import { ollama } from "ollama-ai-provider-v2";
// import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";

const agent = new Agent({
  name: "Haiku Agent",
  instructions: "You respond only in haiku.",
  model: google("gemini-2.5-flash"),
});

async function main() {
  console.log(chalk.bold.cyan(`\n🤖 AI SDK Agents - 01-Hello World`));
  console.log(chalk.cyan(`Agent: ${agent.name}`));

  const result = await Runner.run(agent, "Write a haiku about programming.");

  console.log(chalk.bold.green(`\nResult:`));
  console.log(result.output);
  console.log(
    chalk.dim(
      `\nTokens: ${result.usage.inputTokens} input + ${result.usage.outputTokens} output = ${result.usage.totalTokens} total\n`,
    ),
  );
}

void main();
