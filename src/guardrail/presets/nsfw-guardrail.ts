// Guardrail prompt design inspired by OpenAI's guardrails approach
// (https://guardrails.openai.com/). All prompts are independently authored.

import type { Guardrail } from "@/types";
import type { LanguageModel } from "ai";
import { llmGuardrail } from "../guardrail";
import { extractTextContent } from "../guardrail";

export interface NsfwGuardrailConfig {
  model: LanguageModel;
  name?: string;
}

const SYSTEM_PROMPT = `You are a content safety classifier that detects NSFW (Not Safe For Work) content.

Flag text that contains any of the following:
- Explicit sexual content or graphic sexual descriptions
- Graphic depictions of violence, gore, or mutilation
- Extreme profanity used in a harassing or threatening context
- Content depicting or promoting exploitation or abuse

Do NOT flag:
- Clinical or educational discussions of anatomy, health, or biology
- News reporting on violence without graphic detail
- Casual mild profanity in normal conversation
- Artistic or literary references to mature themes without explicit detail

Analyze the following text and determine if it contains NSFW content.
Answer only YES or NO.`;

export function nsfwGuardrail(config: NsfwGuardrailConfig): Guardrail {
  return llmGuardrail({
    name: config.name ?? "nsfw_guardrail",
    model: config.model,
    promptBuilder: (_ctx, input) => {
      const texts = extractTextContent(input.messages);
      return `${SYSTEM_PROMPT}\n\nText:\n${texts.join("\n")}`;
    },
    tripWhen: (text) => {
      const normalized = text.trim().toUpperCase();
      return normalized.includes("YES") || normalized.includes("FLAGGED");
    },
  });
}
