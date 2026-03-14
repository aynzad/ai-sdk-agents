import chalk from "chalk";
import { z } from "zod";
import { Agent, Runner } from "ai-sdk-agents";
import { ollama } from "ollama-ai-provider-v2";
// import { openai } from "@ai-sdk/openai";
// import { google } from "@ai-sdk/google";

const ResearchOutput = z.object({
  facts: z.array(z.string()),
  topic: z.string(),
  confidence: z.number().min(0).max(1),
});

const QualityCheckOutput = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()),
  score: z.number().min(0).max(10),
});

const model = ollama(process.env.OLLAMA_MODEL ?? "qwen3:4b");
// const model = openai("gpt-4o-mini");
// const model = google("gemini-2.0-flash");

const researchAgent = new Agent({
  name: "Research Agent",
  instructions:
    "You are a research assistant. Given a topic, return a list of key facts, the topic name, and your confidence level (0-1) in the accuracy of the facts.",
  model,
  outputSchema: ResearchOutput,
});

const qualityCheckAgent = new Agent({
  name: "Quality Check Agent",
  instructions:
    "You are a quality reviewer. Given research facts, evaluate their accuracy and completeness. Return whether the research is approved, any issues found, and a quality score from 0-10.",
  model,
  outputSchema: QualityCheckOutput,
});

const writerAgent = new Agent({
  name: "Writer Agent",
  instructions:
    "You are a skilled writer. Given approved research facts, write a concise and engaging summary paragraph.",
  model,
});

async function main() {
  console.log(chalk.bold.cyan("\n🔗 AI SDK Agents - 16-Deterministic Flow"));
  console.log(chalk.dim("Pipeline: Research → Quality Check → Writer\n"));

  const topic = "The history of the Internet";

  console.log(chalk.bold.yellow("Stage 1: Research"));
  const researchResult = await Runner.run(
    researchAgent,
    `Research the following topic: ${topic}`,
  );
  const research = researchResult.output;
  console.log(chalk.white(`  Topic:      ${research.topic}`));
  console.log(chalk.white(`  Facts:      ${research.facts.length} found`));
  console.log(chalk.white(`  Confidence: ${research.confidence}`));

  console.log(chalk.bold.yellow("\nStage 2: Quality Check"));
  const qcResult = await Runner.run(
    qualityCheckAgent,
    `Review these research facts about "${research.topic}":\n${research.facts.map((f, i) => `${i + 1}. ${f}`).join("\n")}\nConfidence: ${research.confidence}`,
  );
  const qc = qcResult.output;
  console.log(chalk.white(`  Approved: ${qc.approved}`));
  console.log(chalk.white(`  Score:    ${qc.score}/10`));
  if (qc.issues.length > 0) {
    console.log(chalk.white(`  Issues:   ${qc.issues.join(", ")}`));
  }

  if (!qc.approved) {
    console.log(chalk.red("\n✗ Quality check failed. Pipeline halted."));
    return;
  }

  console.log(chalk.bold.yellow("\nStage 3: Writer"));
  const writerResult = await Runner.run(
    writerAgent,
    `Write a summary based on these approved facts about "${research.topic}":\n${research.facts.map((f, i) => `${i + 1}. ${f}`).join("\n")}`,
  );

  console.log(chalk.bold.green("\nFinal Output:"));
  console.log(writerResult.output);

  console.log(
    chalk.dim(
      `\nTotal tokens: ${(researchResult.usage.totalTokens ?? 0) + (qcResult.usage.totalTokens ?? 0) + (writerResult.usage.totalTokens ?? 0)}\n`,
    ),
  );
}

void main();
