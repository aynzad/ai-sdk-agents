import { tool } from "ai";
import { z } from "zod";
import { Agent } from "ai-sdk-agents";
import { google } from "@ai-sdk/google";

export const getRecord = tool({
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

/**
 * Client-side tool — no `execute` function.
 * The UI renders an approval dialog and calls `addToolOutput` with the result.
 * This is the core HITL pattern: the agent proposes a change, the human decides.
 */
export const updateRecord = tool({
  description: "Update a record in the database. Requires human approval.",
  inputSchema: z.object({
    id: z.string().describe("The record ID to update"),
    field: z.string().describe("The field to update"),
    value: z.string().describe("The new value"),
  }),
});

export const dbAgent = new Agent({
  name: "Database Agent",
  instructions:
    "You are a helpful database assistant. You can look up records with getRecord " +
    "and update them with updateRecord. Always use updateRecord when the user asks " +
    "to make changes — it requires human approval before executing.",
  model: google("gemini-2.5-flash"),
  tools: { getRecord },
  hooks: {
    onToolCall: (_ctx, toolName, args) => {
      console.log(`[HITL] Agent requested tool: ${toolName}`, args);
    },
  },
});
