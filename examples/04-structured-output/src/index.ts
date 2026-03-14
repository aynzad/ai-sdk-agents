import chalk from "chalk";
import { z } from "zod";
import { Agent, Runner } from "ai-sdk-agents";
// import { ollama } from "ollama-ai-provider-v2";
// import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";

const MovieRecommendation = z.object({
  title: z.string().describe("The movie title"),
  year: z.number().describe("Release year"),
  genre: z.string().describe("Primary genre"),
  synopsis: z.string().describe("A brief synopsis of the movie"),
  rating: z.number().min(1).max(10).describe("Rating out of 10"),
});

type MovieRecommendation = z.infer<typeof MovieRecommendation>;

const agent = new Agent({
  name: "Movie Recommender",
  instructions: "You are a movie recommendation expert.",
  // model: ollama(process.env.OLLAMA_MODEL ?? "qwen3:4b"),
  // model: openai("gpt-4o-mini"),
  model: google("gemini-2.5-flash"),
  outputSchema: MovieRecommendation,
});

async function main() {
  console.log(chalk.bold.cyan(`\n🤖 AI SDK Agents - 04-Structured Output`));
  console.log(chalk.cyan(`Agent: ${agent.name}`));
  console.log(chalk.dim(`Output schema: MovieRecommendation\n`));

  const result = await Runner.run(
    agent,
    "Recommend a sci-fi movie from the 2000s.",
  );

  const movie = result.output;
  console.log(chalk.bold.green(`Movie Recommendation:`));
  console.log(chalk.white(`  Title:    ${movie.title}`));
  console.log(chalk.white(`  Year:     ${movie.year}`));
  console.log(chalk.white(`  Genre:    ${movie.genre}`));
  console.log(
    chalk.white(`  Rating:   ${"⭐".repeat(Math.round(movie.rating / 2))}`),
  );
  console.log(chalk.white(`  Synopsis: ${movie.synopsis}`));

  console.log(
    chalk.dim(
      `\nTokens: ${result.usage.inputTokens} input + ${result.usage.outputTokens} output = ${result.usage.totalTokens} total\n`,
    ),
  );
}

void main();
