import chalk from "chalk";
import {
  Agent,
  Runner,
  llmGuardrail,
  GuardrailTripwiredError,
} from "ai-sdk-agents";
// import { ollama } from "ollama-ai-provider-v2";
import { google } from "@ai-sdk/google";

const model = google("gemini-2.5-flash");

const factCheck = llmGuardrail({
  name: "factuality-check",
  model,
  promptBuilder: (_ctx, input) => {
    const text = input.messages
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join(" ");
    return `Is the following text factual and appropriate? Respond with "PASS" or "FAIL".\n\nText: ${text}`;
  },
  tripWhen: (text) => text.toUpperCase().includes("FAIL"),
});

const agent = new Agent({
  name: "Guarded Agent",
  instructions:
    "You are a helpful assistant. Always respond with factual information.",
  model,
  outputGuardrails: [factCheck],
});

async function main() {
  console.log(chalk.bold.cyan("\n🛡️  AI SDK Agents - 12-LLM Guardrail"));
  console.log(chalk.dim("Using llmGuardrail() for factuality checking\n"));

  try {
    const result = await Runner.run(agent, "What is the capital of France?");
    console.log(chalk.bold.green("Result:"));
    console.log(result.output);
  } catch (error) {
    if (error instanceof GuardrailTripwiredError) {
      console.log(chalk.bold.red("Guardrail tripped!"));
      console.log(chalk.red(`  Name: ${error.guardrailName}`));
      console.log(chalk.red(`  Reason: ${error.reason}`));
    } else {
      throw error;
    }
  }
}

void main();
