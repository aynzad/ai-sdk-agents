// Guardrail prompt design inspired by OpenAI's guardrails approach
// (https://guardrails.openai.com/). All prompts are independently authored.

import type { Guardrail } from "@/guardrail/types";
import type { LanguageModel } from "ai";
import { llmGuardrail } from "../guardrail";
import { extractTextContent } from "../guardrail";

export interface TopicGuardrailConfig {
  model: LanguageModel;
  allowedTopics: string;
  name?: string;
}

function buildPrompt(allowedTopics: string): string {
  return `You are a topical alignment classifier. Your job is to determine whether a message falls outside the allowed scope of conversation.

Allowed scope:
${allowedTopics}

If the message is clearly outside the allowed scope, answer YES (off-topic).
If the message is within scope or reasonably related, answer NO (on-topic).
Greetings, clarifications, and meta-questions about the service are always on-topic.

Answer only YES or NO.`;
}

export function topicGuardrail(config: TopicGuardrailConfig): Guardrail {
  return llmGuardrail({
    name: config.name ?? "topic_guardrail",
    model: config.model,
    promptBuilder: (_ctx, input) => {
      const texts = extractTextContent(input.messages);
      return `${buildPrompt(config.allowedTopics)}\n\nText:\n${texts.join("\n")}`;
    },
    tripWhen: (text) => {
      const normalized = text.trim().toUpperCase();
      return normalized.includes("YES") || normalized.includes("FLAGGED");
    },
  });
}
