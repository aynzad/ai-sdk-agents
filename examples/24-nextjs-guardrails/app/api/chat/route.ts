import { type UIMessage } from "ai";
import { guardedAgent } from "@/lib/agent";
import { streamAgentResponse } from "@/lib/stream-agent";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: UIMessage[] };

  return streamAgentResponse({
    agent: guardedAgent,
    messages,
  });
}
