import {
  streamText,
  type UIMessage,
  convertToModelMessages,
  stepCountIs,
} from "ai";
import { z } from "zod";
import { google } from "@ai-sdk/google";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: UIMessage[] };

  const result = streamText({
    model: google("gemini-2.5-flash"),
    system:
      "You are a helpful database assistant. You can look up records and update them. " +
      "Always use the updateRecord tool when the user asks to make changes. " +
      "The updateRecord tool requires human approval before executing.",
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      getRecord: {
        description: "Look up a record from the database by ID",
        inputSchema: z.object({
          id: z.string().describe("The record ID to look up"),
        }),
        execute: ({ id }: { id: string }) => ({
          id,
          name: "Acme Corporation",
          email: "contact@acme.com",
          status: "active",
          balance: 15_250.0,
        }),
      },
      updateRecord: {
        description:
          "Update a record in the database. Requires human approval.",
        inputSchema: z.object({
          id: z.string().describe("The record ID to update"),
          field: z.string().describe("The field to update"),
          value: z.string().describe("The new value"),
        }),
      },
    },
  });

  return result.toUIMessageStreamResponse();
}
