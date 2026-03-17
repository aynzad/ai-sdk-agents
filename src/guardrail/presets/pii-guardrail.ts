// Guardrail design inspired by OpenAI's guardrails approach
// (https://guardrails.openai.com/). All patterns are independently authored.

import type { Guardrail } from "@/types";
import { extractTextContent } from "../guardrail";

export type PiiEntity =
  | "US_SSN"
  | "EMAIL"
  | "CREDIT_CARD"
  | "PHONE_US"
  | "IP_ADDRESS"
  | "US_PASSPORT"
  | "DATE_OF_BIRTH"
  | "IBAN"
  | "US_DRIVER_LICENSE"
  | "US_BANK_ACCOUNT"
  | "US_ITIN"
  | "US_EIN";

export interface PiiGuardrailConfig {
  entities?: PiiEntity[];
  name?: string;
}

const PII_PATTERNS: Record<PiiEntity, RegExp> = {
  US_SSN: /\b\d{3}-\d{2}-\d{4}\b/,
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  CREDIT_CARD: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
  PHONE_US: /(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  IP_ADDRESS:
    /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/,
  US_PASSPORT: /\b[A-Z]\d{8}\b/,
  DATE_OF_BIRTH:
    /\b(?:0[1-9]|1[0-2])[/.-](?:0[1-9]|[12]\d|3[01])[/.-](?:19|20)\d{2}\b/,
  IBAN: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/,
  US_DRIVER_LICENSE: /\b[A-Z]\d{3}-\d{4}-\d{4}\b/,
  US_BANK_ACCOUNT: /\b\d{8,17}\b/,
  US_ITIN: /\b9\d{2}-[7-9]\d-\d{4}\b/,
  US_EIN: /\b\d{2}-\d{7}\b/,
};

const ALL_ENTITIES = Object.keys(PII_PATTERNS) as PiiEntity[];

// Entities that are too broad to enable by default (high false positive rate)
const BROAD_ENTITIES: Set<PiiEntity> = new Set(["US_BANK_ACCOUNT", "US_EIN"]);

const DEFAULT_ENTITIES = ALL_ENTITIES.filter((e) => !BROAD_ENTITIES.has(e));

export function piiGuardrail(config?: PiiGuardrailConfig): Guardrail {
  const entities = config?.entities ?? DEFAULT_ENTITIES;
  const name = config?.name ?? "pii_guardrail";

  return {
    name,
    execute: (_ctx, input) => {
      const texts = extractTextContent(input.messages);
      const detected = new Set<PiiEntity>();

      for (const text of texts) {
        for (const entity of entities) {
          const pattern = PII_PATTERNS[entity];
          if (pattern.test(text)) {
            detected.add(entity);
          }
        }
      }

      if (detected.size > 0) {
        const list = [...detected];
        return Promise.resolve({
          tripwired: true,
          reason: `PII detected: ${list.join(", ")}`,
          metadata: { detectedEntities: list },
        });
      }

      return Promise.resolve({ tripwired: false });
    },
  };
}
