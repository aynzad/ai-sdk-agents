import { Agent } from "ai-sdk-agents";
import { google } from "@ai-sdk/google";

export const chatAgent = new Agent({
  name: "Chat Agent",
  instructions:
    "You are a helpful, friendly assistant. Respond concisely and clearly.",
  model: google("gemini-2.5-flash"),
});
