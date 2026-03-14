import { type UIMessage } from "ai";
import { Runner } from "ai-sdk-agents";
import { dbAgent } from "@/lib/agent";

export const maxDuration = 30;

/**
 * Uses Runner.streamUI() to handle both server-side tools (getRecord) and
 * client-side tools (updateRecord) from the agent's configuration.
 *
 * Client-side tools (defined in agent.clientTools) have no `execute` function —
 * the stream pauses when they're invoked and waits for the frontend to provide
 * a tool output via addToolOutput.
 */
export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: UIMessage[] };
  return Runner.streamUI(dbAgent, messages);
}
