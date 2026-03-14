import { streamText, type UIMessage, convertToModelMessages } from "ai";
import { google } from "@ai-sdk/google";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: UIMessage[] };

  const result = streamText({
    model: google("gemini-2.5-flash"),
    system:
      "You are a helpful, friendly assistant. Respond concisely and clearly.",
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
