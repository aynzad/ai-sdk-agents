import chalk from "chalk";
import { Agent, Runner, handoff, handoffFilters } from "ai-sdk-agents";
import { ollama } from "ollama-ai-provider-v2";
// import { openai } from "@ai-sdk/openai";
// import { google } from "@ai-sdk/google";

const model = ollama(process.env.OLLAMA_MODEL ?? "qwen3:4b");
// const model = openai("gpt-4o-mini");
// const model = google("gemini-2.0-flash");

const specialistAgent = new Agent({
  name: "Specialist Agent",
  instructions:
    "You are a specialist. Answer based on the conversation context you receive.",
  model,
});

const triageAgent = new Agent({
  name: "Triage Agent",
  instructions:
    "You are a triage agent. If the user asks a technical question, hand off to the specialist.",
  model,
  handoffs: [
    handoff(specialistAgent, {
      inputFilter: handoffFilters.compose(
        (msgs) => handoffFilters.removeToolMessages(msgs),
        handoffFilters.keepLast(3),
      ),
    }),
  ],
});

async function main() {
  console.log(chalk.bold.cyan(`\n🤖 AI SDK Agents - 08-Handoff with Filters`));
  console.log(chalk.cyan(`Triage: ${triageAgent.name}`));
  console.log(chalk.cyan(`Specialist: ${specialistAgent.name}\n`));

  const result = await Runner.run(
    triageAgent,
    "I have a technical question about database indexing strategies.",
  );

  console.log(chalk.bold.green(`\nResult:`));
  console.log(result.output);
  console.log(chalk.dim(`\nAnswered by: ${result.agent}`));
  console.log(
    chalk.dim(
      `Tokens: ${result.usage.inputTokens} input + ${result.usage.outputTokens} output = ${result.usage.totalTokens} total\n`,
    ),
  );
}

void main();
