import chalk from "chalk";
import { Agent, Runner, type RunContext } from "ai-sdk-agents";
// import { ollama } from "ollama-ai-provider-v2";
// import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";

interface UserPreferences {
  language: string;
  expertiseLevel: "beginner" | "intermediate" | "expert";
}

const agent = new Agent<UserPreferences>({
  name: "Adaptive Assistant",
  instructions: (ctx: RunContext<UserPreferences>) => {
    const { language, expertiseLevel } = ctx.context;
    return [
      `You are a helpful programming assistant.`,
      `Respond in ${language}.`,
      `The user's expertise level is "${expertiseLevel}".`,
      expertiseLevel === "beginner"
        ? "Use simple language, avoid jargon, and provide step-by-step explanations."
        : expertiseLevel === "expert"
          ? "Be concise and technical. Skip basic explanations."
          : "Balance clarity with technical detail.",
    ].join(" ");
  },
  // model: ollama(process.env.OLLAMA_MODEL ?? "qwen3:4b"),
  // model: openai("gpt-4o-mini"),
  model: google("gemini-2.5-flash"),
});

async function main() {
  console.log(chalk.bold.cyan(`\n🤖 AI SDK Agents - 05-Dynamic Instructions`));
  console.log(chalk.cyan(`Agent: ${agent.name}\n`));

  const prompt = "Explain what a REST API is.";

  console.log(chalk.bold.yellow(`--- Run 1: Beginner / English ---`));
  const result1 = await Runner.run(agent, prompt, {
    context: { language: "English", expertiseLevel: "beginner" },
  });
  console.log(result1.output);

  console.log(chalk.bold.yellow(`\n--- Run 2: Expert / English ---`));
  const result2 = await Runner.run(agent, prompt, {
    context: { language: "English", expertiseLevel: "expert" },
  });
  console.log(result2.output);

  const totalTokens =
    (result1.usage.totalTokens ?? 0) + (result2.usage.totalTokens ?? 0);
  console.log(chalk.dim(`\nTokens: ${totalTokens} total across both runs\n`));
}

void main();
