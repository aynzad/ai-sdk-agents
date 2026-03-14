import chalk from "chalk";
import { Agent, Runner, handoff } from "ai-sdk-agents";
import { ollama } from "ollama-ai-provider-v2";
// import { openai } from "@ai-sdk/openai";
// import { google } from "@ai-sdk/google";

const model = ollama(process.env.OLLAMA_MODEL ?? "qwen3:4b");

const spanishAgent = new Agent({
  name: "Spanish Agent",
  instructions: "You are a helpful assistant that always responds in Spanish.",
  model,
});

const triageAgent = new Agent({
  name: "Triage Agent",
  instructions:
    "You are a triage agent. If the user writes in Spanish, hand off to the Spanish Agent. Otherwise respond in English.",
  model,
  handoffs: [handoff(spanishAgent)],
});

async function main() {
  console.log(chalk.bold.cyan("\n🤖 AI SDK Agents - 07-Agent Handoff"));
  console.log(chalk.cyan(`Agent: ${triageAgent.name}`));
  console.log(chalk.dim("Handoffs: Spanish Agent\n"));

  const result = await Runner.run(
    triageAgent,
    "Hola, necesito ayuda con mi cuenta",
  );

  console.log(chalk.bold.green("\nResult:"));
  console.log(result.output);
  console.log(chalk.bold.magenta(`\nFinal agent: ${result.agent}`));

  const handoffSteps = result.steps.filter((s) => s.type === "handoff");
  if (handoffSteps.length > 0) {
    console.log(chalk.bold.yellow(`\nHandoff steps (${handoffSteps.length}):`));
    for (const step of handoffSteps) {
      const data = step.data as { from: string; to: string };
      console.log(chalk.yellow(`  → ${data.from} → ${data.to}`));
    }
  }

  console.log(
    chalk.dim(
      `\nTokens: ${result.usage.inputTokens} input + ${result.usage.outputTokens} output = ${result.usage.totalTokens} total\n`,
    ),
  );
}

void main();
