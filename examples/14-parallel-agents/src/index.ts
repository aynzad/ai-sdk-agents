import chalk from "chalk";
import { Agent, Runner } from "ai-sdk-agents";
import { ollama } from "ollama-ai-provider-v2";
// import { openai } from "@ai-sdk/openai";
// import { google } from "@ai-sdk/google";

const model = ollama(process.env.OLLAMA_MODEL ?? "qwen3:4b");

const optimist = new Agent({
  name: "Optimist",
  instructions:
    "You are an optimist. Analyze the given topic from a positive perspective. Keep it to 2-3 sentences.",
  model,
});

const pessimist = new Agent({
  name: "Pessimist",
  instructions:
    "You are a pessimist. Analyze the given topic from a negative perspective. Keep it to 2-3 sentences.",
  model,
});

const realist = new Agent({
  name: "Realist",
  instructions:
    "You are a realist. Analyze the given topic from a balanced, factual perspective. Keep it to 2-3 sentences.",
  model,
});

async function main() {
  console.log(chalk.bold.cyan("\n🤖 AI SDK Agents - 14-Parallel Agents"));
  console.log(chalk.dim("Running three agents in parallel...\n"));

  const topic = "The impact of AI on software development";

  const [opt, pess, real] = await Promise.all([
    Runner.run(optimist, topic),
    Runner.run(pessimist, topic),
    Runner.run(realist, topic),
  ]);

  console.log(chalk.bold.green("Optimist:"));
  console.log(opt.output);
  console.log(chalk.bold.red("\nPessimist:"));
  console.log(pess.output);
  console.log(chalk.bold.blue("\nRealist:"));
  console.log(real.output);

  const synthesizer = new Agent({
    name: "Synthesizer",
    instructions:
      "Synthesize the following three perspectives into a balanced 3-sentence summary.",
    model,
  });

  const synthesis = await Runner.run(
    synthesizer,
    `Optimist: ${opt.output}\n\nPessimist: ${pess.output}\n\nRealist: ${real.output}`,
  );

  console.log(chalk.bold.magenta("\nSynthesis:"));
  console.log(synthesis.output);
  console.log(
    chalk.dim(
      `\nTotal tokens: ${(opt.usage.totalTokens ?? 0) + (pess.usage.totalTokens ?? 0) + (real.usage.totalTokens ?? 0) + (synthesis.usage.totalTokens ?? 0)}\n`,
    ),
  );
}

void main();
