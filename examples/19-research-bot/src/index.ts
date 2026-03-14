import chalk from "chalk";
import { z } from "zod";
import { Agent, Runner } from "ai-sdk-agents";
import { ollama } from "ollama-ai-provider-v2";
// import { openai } from "@ai-sdk/openai";
// import { google } from "@ai-sdk/google";

const PlanSchema = z.object({
  searchTerms: z.array(z.string()).describe("Search terms to research"),
  topic: z.string(),
});

const SearchResultSchema = z.object({
  summary: z.string(),
  keyFacts: z.array(z.string()),
});

const model = ollama(process.env.OLLAMA_MODEL ?? "qwen3:4b");
// const model = openai("gpt-4o-mini");
// const model = google("gemini-2.0-flash");

const planner = new Agent({
  name: "Planner",
  instructions:
    "Given a research topic, suggest 3 search terms to investigate.",
  model,
  outputSchema: PlanSchema,
});

const searcher = new Agent({
  name: "Searcher",
  instructions:
    "Given a search term, produce a brief summary and key facts. Simulate research with realistic content.",
  model,
  outputSchema: SearchResultSchema,
});

const writer = new Agent({
  name: "Writer",
  instructions:
    "Given research summaries, write a coherent 3-paragraph report.",
  model,
});

async function main() {
  console.log(chalk.bold.cyan("\n🔬 AI SDK Agents - 19-Research Bot"));
  console.log(chalk.dim("Pipeline: Planner → Searchers → Writer\n"));

  const topic = "The future of quantum computing";

  console.log(chalk.bold.yellow("Step 1: Planning"));
  console.log(chalk.dim(`Topic: ${topic}\n`));

  const planResult = await Runner.run(planner, `Research topic: ${topic}`);
  const { searchTerms } = planResult.output;

  console.log(chalk.green("Search terms:"));
  for (const term of searchTerms) {
    console.log(chalk.green(`  • ${term}`));
  }

  console.log(chalk.bold.yellow("\nStep 2: Researching (parallel)"));

  const searchResults = await Promise.all(
    searchTerms.map(async (term) => {
      console.log(chalk.dim(`  Searching: ${term}`));
      const result = await Runner.run(searcher, `Research this term: ${term}`);
      return { term, ...result.output };
    }),
  );

  for (const sr of searchResults) {
    console.log(chalk.green(`\n  "${sr.term}":`));
    console.log(chalk.white(`    ${sr.summary}`));
    for (const fact of sr.keyFacts) {
      console.log(chalk.dim(`    - ${fact}`));
    }
  }

  console.log(chalk.bold.yellow("\nStep 3: Writing report"));

  const researchContext = searchResults
    .map(
      (sr) =>
        `## ${sr.term}\n${sr.summary}\nKey facts: ${sr.keyFacts.join("; ")}`,
    )
    .join("\n\n");

  const reportResult = await Runner.run(
    writer,
    `Write a research report on "${topic}" using these findings:\n\n${researchContext}`,
  );

  console.log(chalk.bold.green("\n📄 Final Report:\n"));
  console.log(reportResult.output);

  console.log(
    chalk.dim(
      `\nTokens: ${reportResult.usage.inputTokens} input + ${reportResult.usage.outputTokens} output = ${reportResult.usage.totalTokens} total\n`,
    ),
  );
}

void main();
