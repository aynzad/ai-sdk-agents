import {
  streamText,
  type UIMessage,
  convertToModelMessages,
  stepCountIs,
} from "ai";
import { dbAgent, getRecord, updateRecord } from "@/lib/agent";

export const maxDuration = 30;

/**
 * Uses the Agent definition from ai-sdk-agents for model and instructions,
 * but calls streamText directly to support client-side tools (updateRecord)
 * that require human approval via addToolOutput on the frontend.
 *
 * Runner.stream() would auto-execute all tools, but we need updateRecord
 * to pause and wait for the user's approve/reject decision.
 */
export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: UIMessage[] };

  const result = streamText({
    model: dbAgent.config.model,
    system: dbAgent.config.instructions as string,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      getRecord,
      updateRecord,
    },
  });

  return result.toUIMessageStreamResponse();
}
