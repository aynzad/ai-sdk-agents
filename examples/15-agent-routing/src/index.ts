import chalk from "chalk";
import { Agent, Runner, handoff } from "ai-sdk-agents";
// import { ollama } from "ollama-ai-provider-v2";
// import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";

const model = google("gemini-2.5-flash");

const englishAgent = new Agent({
  name: "English Agent",
  instructions: "You are a helpful assistant that responds in English.",
  model,
});

const frenchAgent = new Agent({
  name: "French Agent",
  instructions: "You are a helpful assistant that always responds in French.",
  model,
});

const germanAgent = new Agent({
  name: "German Agent",
  instructions: "You are a helpful assistant that always responds in German.",
  model,
});

const triageAgent = new Agent({
  name: "Triage Agent",
  instructions:
    "You detect the language of the user's message and hand off to the appropriate agent. For English → English Agent, French → French Agent, German → German Agent.",
  model,
  handoffs: [handoff(englishAgent), handoff(frenchAgent), handoff(germanAgent)],
});

async function main() {
  console.log(chalk.bold.cyan("\n🤖 AI SDK Agents - 15-Agent Routing"));
  console.log(chalk.cyan(`Agent: ${triageAgent.name}`));
  console.log(
    chalk.dim("Handoffs: English Agent, French Agent, German Agent\n"),
  );

  const result = await Runner.run(triageAgent, "Bonjour, comment ça va?");

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
