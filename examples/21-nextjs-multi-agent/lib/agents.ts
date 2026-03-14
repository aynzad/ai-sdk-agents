import { tool } from "ai";
import { z } from "zod";
import { Agent, handoff } from "ai-sdk-agents";
import { google } from "@ai-sdk/google";

const model = google("gemini-2.5-flash");

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

export const faqAgent = new Agent({
  name: "FAQ Agent",
  instructions:
    "You are an airline FAQ specialist. Use the lookupFAQ tool to find answers. Always be friendly and concise.",
  model,
  tools: { lookupFAQ },
});

export const bookingAgent = new Agent({
  name: "Booking Agent",
  instructions:
    "You are a booking specialist for seat changes. Use getSeatInfo to show available seats and changeSeat to make changes. Confirm changes with the customer.",
  model,
  tools: { getSeatInfo, changeSeat },
});

export const triageAgent = new Agent({
  name: "Triage Agent",
  instructions:
    "You are a customer service triage agent for an airline. Classify the user's intent and route them:\n" +
    "- For questions about policies, baggage, check-in, refunds, Wi-Fi, or pets → hand off to FAQ Agent\n" +
    "- For seat changes, seat selection, or booking modifications → hand off to Booking Agent\n" +
    "- For simple greetings or unclear requests, respond directly and ask how you can help.",
  model,
  handoffs: [handoff(faqAgent), handoff(bookingAgent)],
});
