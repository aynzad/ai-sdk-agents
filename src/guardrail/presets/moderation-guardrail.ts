// Guardrail prompt design inspired by OpenAI's guardrails approach
// (https://guardrails.openai.com/). All prompts are independently authored.

import type { Guardrail } from "@/types";
import type { LanguageModel } from "ai";
import { llmGuardrail } from "../guardrail";
import { extractTextContent } from "../guardrail";

export type ModerationCategory =
  | "hate"
  | "violence"
  | "sexual"
  | "self-harm"
  | "harassment"
  | "illegal";

export interface ModerationGuardrailConfig {
  model: LanguageModel;
  categories?: ModerationCategory[];
  name?: string;
}

const ALL_CATEGORIES: ModerationCategory[] = [
  "hate",
  "violence",
  "sexual",
  "self-harm",
  "harassment",
  "illegal",
];

const CATEGORY_DESCRIPTIONS: Record<ModerationCategory, string> = {
  hate: "Hate speech targeting individuals or groups based on protected characteristics (race, ethnicity, religion, gender, sexual orientation, disability)",
  violence:
    "Graphic violence, threats of physical harm, glorification of violence, or instructions for violent acts",
  sexual:
    "Sexually explicit content, graphic sexual descriptions, or sexual content involving minors",
  "self-harm":
    "Content promoting, encouraging, or providing instructions for self-harm, suicide, or eating disorders",
  harassment:
    "Bullying, intimidation, threats, stalking, or targeted harassment against individuals",
  illegal:
    "Instructions or encouragement for illegal activities including fraud, drug manufacturing, weapons creation, or trafficking",
};

function buildPrompt(categories: ModerationCategory[]): string {
  const categoryList = categories
    .map((c) => `- ${c}: ${CATEGORY_DESCRIPTIONS[c]}`)
    .join("\n");

  return `You are a content moderation classifier. Analyze the following text and determine if it violates any of these content policies:

${categoryList}

Does the text violate any of the above policies?
Answer only YES or NO.`;
}

export function moderationGuardrail(
  config: ModerationGuardrailConfig,
): Guardrail {
  const categories = config.categories ?? ALL_CATEGORIES;

  return llmGuardrail({
    name: config.name ?? "moderation_guardrail",
    model: config.model,
    promptBuilder: (_ctx, input) => {
      const texts = extractTextContent(input.messages);
      return `${buildPrompt(categories)}\n\nText:\n${texts.join("\n")}`;
    },
    tripWhen: (text) => {
      const normalized = text.trim().toUpperCase();
      return normalized.includes("YES") || normalized.includes("FLAGGED");
    },
  });
}
