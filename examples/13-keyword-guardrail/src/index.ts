import chalk from "chalk";
import {
  Agent,
  Runner,
  keywordGuardrail,
  maxLengthGuardrail,
  regexGuardrail,
  GuardrailTripwiredError,
} from "ai-sdk-agents";
import { ollama } from "ollama-ai-provider-v2";

const noBlockedWords = keywordGuardrail({
  blockedKeywords: ["hack", "exploit", "malware"],
});

const lengthLimit = maxLengthGuardrail({ maxLength: 500 });

const noCreditCards = regexGuardrail({
  pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,
  reason: "Credit card number detected",
});

const agent = new Agent({
  name: "Safe Agent",
  instructions:
    "You are a helpful assistant. Never include credit card numbers in your responses.",
  model: ollama(process.env.OLLAMA_MODEL ?? "qwen3:4b"),
  inputGuardrails: [noBlockedWords],
  outputGuardrails: [lengthLimit, noCreditCards],
});

async function main() {
  console.log(chalk.bold.cyan("\n🛡️  AI SDK Agents - 13-Keyword Guardrail"));
  console.log(
    chalk.dim("Using keywordGuardrail, maxLengthGuardrail, regexGuardrail\n"),
  );

  const prompts = [
    "What is the weather today?",
    "How do I hack into a system?",
  ];

  for (const prompt of prompts) {
    console.log(chalk.bold(`\nPrompt: ${prompt}`));
    try {
      const result = await Runner.run(agent, prompt);
      console.log(chalk.green(`  Response: ${result.output}`));
    } catch (error) {
      if (error instanceof GuardrailTripwiredError) {
        console.log(
          chalk.red(`  Blocked! ${error.guardrailName}: ${error.reason}`),
        );
      } else {
        throw error;
      }
    }
  }
}

void main();
