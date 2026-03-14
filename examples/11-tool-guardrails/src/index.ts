import chalk from "chalk";
import { z } from "zod";
import {
  Agent,
  Runner,
  guardedTool,
  defineToolInputGuardrail,
  defineToolOutputGuardrail,
  ToolGuardrailBehaviorFactory,
  isGuardedTool,
} from "ai-sdk-agents";
import { ollama } from "ollama-ai-provider-v2";
// import { openai } from "@ai-sdk/openai";
// import { google } from "@ai-sdk/google";

const noSqlInjection = defineToolInputGuardrail({
  name: "no-sql-injection",
  execute: (data) => {
    const input = JSON.stringify(data.input);
    const suspicious = /('|--|;|DROP|DELETE|INSERT)/i.test(input);
    return Promise.resolve(
      suspicious
        ? ToolGuardrailBehaviorFactory.throwException(
            "SQL injection attempt blocked",
          )
        : ToolGuardrailBehaviorFactory.allow(),
    );
  },
});

const noPII = defineToolOutputGuardrail({
  name: "no-pii",
  execute: (data) => {
    const output = JSON.stringify(data.output);
    const hasPII = /\d{3}-\d{2}-\d{4}/.test(output);
    return Promise.resolve(
      hasPII
        ? ToolGuardrailBehaviorFactory.rejectContent(
            "PII detected in tool output",
          )
        : ToolGuardrailBehaviorFactory.allow(),
    );
  },
});

const dbQuery = guardedTool({
  description: "Query the database",
  inputSchema: z.object({ query: z.string() }),
  execute: ({ query }) =>
    Promise.resolve({ results: [`Result for: ${query}`] }),
  inputGuardrails: [noSqlInjection],
  outputGuardrails: [noPII],
});

const agent = new Agent({
  name: "DB Agent",
  instructions:
    "You are a database assistant. Use the dbQuery tool to answer questions about data.",
  model: ollama(process.env.OLLAMA_MODEL ?? "qwen3:4b"),
  // model: openai("gpt-4o-mini"),
  // model: google("gemini-2.0-flash"),
  tools: { dbQuery },
});

async function main() {
  console.log(chalk.bold.cyan("\n🛡️  AI SDK Agents - 11-Tool Guardrails"));
  console.log(chalk.cyan(`Agent: ${agent.name}`));
  console.log(
    chalk.dim(`Tools: ${Object.keys(agent.config.tools ?? {}).join(", ")}`),
  );
  console.log(chalk.dim(`dbQuery is guarded: ${isGuardedTool(dbQuery)}\n`));

  const result = await Runner.run(
    agent,
    "Show me all active users from the database",
  );

  console.log(chalk.bold.green("\nResult:"));
  console.log(result.output);

  const toolSteps = result.steps.filter((s) => s.type === "tool_call");
  if (toolSteps.length > 0) {
    console.log(chalk.bold.yellow(`\nTool calls (${toolSteps.length}):`));
    for (const step of toolSteps) {
      const tc = step.data as { toolName: string; input: unknown };
      console.log(
        chalk.yellow(`  → ${tc.toolName}(`),
        tc.input,
        chalk.yellow(")"),
      );
    }
  }

  console.log(
    chalk.dim(
      `\nTokens: ${result.usage.inputTokens} input + ${result.usage.outputTokens} output = ${result.usage.totalTokens} total\n`,
    ),
  );
}

void main();
