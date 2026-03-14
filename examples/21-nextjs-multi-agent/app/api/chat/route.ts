import {
  streamText,
  type UIMessage,
  convertToModelMessages,
  tool,
  stepCountIs,
} from "ai";
import { z } from "zod";
import { google } from "@ai-sdk/google";

export const maxDuration = 30;

const lookupFAQ = tool({
  description: "Look up frequently asked questions about the airline",
  inputSchema: z.object({
    topic: z.string().describe("The FAQ topic to look up"),
  }),
  execute: ({ topic }) => {
    const faqs: Record<string, string> = {
      baggage:
        "Carry-on: 1 bag up to 10kg. Checked: 1 bag up to 23kg included, additional bags $50 each.",
      checkin:
        "Online check-in opens 24 hours before departure. Airport counters open 3 hours before.",
      refund:
        "Full refund within 24 hours of booking. After that, a $75 cancellation fee applies.",
      pets: "Small pets allowed in cabin for $95. Must be in an approved carrier under the seat.",
      wifi: "In-flight Wi-Fi available on all flights. Free messaging, $8 for full internet access.",
    };
    const key = Object.keys(faqs).find((k) => topic.toLowerCase().includes(k));
    return (
      key ??
      "No FAQ found for that topic. Please contact support at 1-800-555-0199."
    );
  },
});

const getSeatInfo = tool({
  description: "Get current seat map and availability for a flight",
  inputSchema: z.object({}),
  execute: () => ({
    currentSeat: "14B",
    available: ["2A", "7F", "12A", "18C", "22F"],
    upgrades: ["2A (Business, +$120)", "7F (Extra legroom, +$45)"],
  }),
});

const changeSeat = tool({
  description: "Change the passenger's seat assignment",
  inputSchema: z.object({
    newSeat: z.string().describe("The new seat to assign"),
  }),
  execute: ({ newSeat }) => ({
    success: true,
    previousSeat: "14B",
    newSeat,
    message: `Seat changed to ${newSeat}. Your boarding pass has been updated.`,
  }),
});

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: UIMessage[] };

  const result = streamText({
    model: google("gemini-2.5-flash"),
    system:
      "You are a customer service triage agent for an airline. " +
      "For questions about policies, baggage, check-in, refunds, Wi-Fi, or pets, use the lookupFAQ tool. " +
      "For seat changes or booking modifications, use getSeatInfo and changeSeat tools. " +
      "Always be friendly and helpful.",
    messages: await convertToModelMessages(messages),
    tools: { lookupFAQ, getSeatInfo, changeSeat },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
