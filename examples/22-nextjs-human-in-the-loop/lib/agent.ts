import { tool } from "ai";
import { z } from "zod";
import { Agent } from "ai-sdk-agents";
import { google } from "@ai-sdk/google";

const getRecord = tool({
  description: "Look up a record from the database by ID",
  inputSchema: z.object({
    id: z.string().describe("The record ID to look up"),
  }),
  execute: ({ id }) => ({
    id,
    name: "Acme Corporation",
    email: "contact@acme.com",
    status: "active",
    balance: 15_250.0,
  }),
});

export const dbAgent = new Agent({
  name: "Database Agent",
  instructions:
    "You are a helpful database assistant. You can look up records and update them. " +
    "Always use the updateRecord tool when the user asks to make changes. " +
    "The updateRecord tool requires human approval before executing.",
  model: google("gemini-2.5-flash"),
  tools: { getRecord },
});
