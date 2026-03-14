import chalk from "chalk";
import { ollama } from "ollama-ai-provider-v2";
// import { openai } from "@ai-sdk/openai";
// import { google } from "@ai-sdk/google";
import { Agent, Runner } from "ai-sdk-agents";

const model = ollama(process.env.OLLAMA_MODEL ?? "");
// const model = google("gemini-2.0-flash");

const agent = new Agent({
  name: "Haiku Agent",
  instructions: "You respond only in haiku.",
  model,
});

async function main() {
  console.log(chalk.bold.cyan(`\n  Agent: ${agent.name}\n`));

  const result = await Runner.run(agent, "Write a haiku about programming.");

  console.log(result.output);
  console.log(
    chalk.dim(
      `\n  Tokens: ${result.usage.promptTokens} prompt + ${result.usage.completionTokens} completion = ${result.usage.totalTokens} total\n`,
    ),
  );
}

void main();
