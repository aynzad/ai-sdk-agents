import chalk from "chalk";
import { Agent, Runner, type StreamEvent } from "ai-sdk-agents";
// import { ollama } from "ollama-ai-provider-v2";
// import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";

const agent = new Agent({
  name: "Streaming Agent",
  instructions:
    "You are a helpful assistant. Respond concisely in 2-3 sentences.",
  // model: ollama(process.env.OLLAMA_MODEL ?? "qwen3:4b"),
  // model: openai("gpt-4o-mini"),
  model: google("gemini-2.5-flash"),
});

const eventLabel: Record<string, (e: StreamEvent) => string> = {
  agent_start: (e) =>
    chalk.blue(`▶ Agent started: ${(e as { agent: string }).agent}`),
  agent_end: (e) =>
    chalk.blue(`■ Agent ended: ${(e as { agent: string }).agent}`),
  tool_call_start: (e) => {
    const ev = e as { toolName: string; args: unknown };
    return chalk.yellow(
      `🔧 Tool call: ${ev.toolName}(${JSON.stringify(ev.args)})`,
    );
  },
  tool_call_end: (e) => {
    const ev = e as { toolName: string; output: unknown };
    return chalk.yellow(
      `✓ Tool result: ${ev.toolName} → ${JSON.stringify(ev.output)}`,
    );
  },
  done: () => chalk.green(`✅ Stream complete`),
  error: (e) => chalk.red(`✗ Error: ${(e as { error: Error }).error.message}`),
};

async function main() {
  console.log(chalk.bold.cyan(`\n🤖 AI SDK Agents - 03-Streaming`));
  console.log(chalk.cyan(`Agent: ${agent.name}`));
  console.log(chalk.dim(`Streaming response with real-time events...\n`));

  const streamResult = Runner.stream(
    agent,
    "Explain what makes the ocean blue in a few sentences.",
  );

  let streaming = false;

  for await (const event of streamResult.events) {
    if (event.type === "text_delta") {
      if (!streaming) {
        process.stdout.write(chalk.bold.green("Response: "));
        streaming = true;
      }
      if (event.delta) process.stdout.write(event.delta);
    } else if (event.type in eventLabel) {
      const formatter = eventLabel[event.type];
      if (streaming && event.type !== "done") {
        process.stdout.write("\n");
        streaming = false;
      }
      console.log(formatter(event));
    }
  }

  if (streaming) process.stdout.write("\n");

  const result = await streamResult.result;
  console.log(
    chalk.dim(
      `\nTokens: ${result.usage.inputTokens} input + ${result.usage.outputTokens} output = ${result.usage.totalTokens} total`,
    ),
  );
  console.log(chalk.dim(`Steps: ${result.steps.length}\n`));
}

void main();
