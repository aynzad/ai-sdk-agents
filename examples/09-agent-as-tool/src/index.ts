import chalk from "chalk";
import { Agent, Runner } from "ai-sdk-agents";
import { ollama } from "ollama-ai-provider-v2";
// import { openai } from "@ai-sdk/openai";
// import { google } from "@ai-sdk/google";

const model = ollama(process.env.OLLAMA_MODEL ?? "qwen3:4b");
// const model = openai("gpt-4o-mini");
// const model = google("gemini-2.0-flash");

const translator = new Agent({
  name: "Translator",
  instructions:
    "You are a translator. Translate the given text to French. Respond with only the translation.",
  model,
});

const orchestrator = new Agent({
  name: "Orchestrator",
  instructions:
    "You are a helpful assistant that translates text. Always call the translate tool to perform translations. Never translate text yourself - delegate to the tool.",
  model,
  tools: {
    translate: translator.asTool({
      toolName: "translate",
      toolDescription: "Translate text to French",
    }),
  },
});

async function main() {
  console.log(chalk.bold.cyan(`\n🤖 AI SDK Agents - 09-Agent as Tool`));
  console.log(chalk.cyan(`Orchestrator: ${orchestrator.name}`));
  console.log(chalk.cyan(`Sub-agent tool: ${translator.name}\n`));

  const result = await Runner.run(
    orchestrator,
    "Translate 'Hello world' to French",
  );

  console.log(chalk.bold.green(`\nResult:`));
  console.log(result.output);

  console.log(
    chalk.dim(
      `\nTokens: ${result.usage.inputTokens} input + ${result.usage.outputTokens} output = ${result.usage.totalTokens} total\n`,
    ),
  );
}

void main();
