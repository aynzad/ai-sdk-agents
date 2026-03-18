// Guardrail design inspired by OpenAI's guardrails approach
// (https://guardrails.openai.com/). All patterns are independently authored.

import type { Guardrail } from "@/types";
import { extractTextContent } from "../guardrail";

export interface SecretKeyGuardrailConfig {
  sensitivity?: "strict" | "balanced" | "permissive";
  name?: string;
}

interface PrefixPattern {
  prefix: string;
  minLength: number;
}

const KNOWN_PREFIXES: PrefixPattern[] = [
  { prefix: "sk-", minLength: 20 },
  { prefix: "sk_live_", minLength: 20 },
  { prefix: "sk_test_", minLength: 20 },
  { prefix: "pk_live_", minLength: 20 },
  { prefix: "pk_test_", minLength: 20 },
  { prefix: "ghp_", minLength: 36 },
  { prefix: "gho_", minLength: 36 },
  { prefix: "ghu_", minLength: 36 },
  { prefix: "ghs_", minLength: 36 },
  { prefix: "ghr_", minLength: 36 },
  { prefix: "github_pat_", minLength: 30 },
  { prefix: "AKIA", minLength: 16 },
  { prefix: "xoxb-", minLength: 20 },
  { prefix: "xoxp-", minLength: 20 },
  { prefix: "xoxa-", minLength: 20 },
  { prefix: "xoxr-", minLength: 20 },
  { prefix: "eyJ", minLength: 30 },
  { prefix: "npm_", minLength: 20 },
  { prefix: "pypi-", minLength: 20 },
  { prefix: "hf_", minLength: 20 },
  { prefix: "whsec_", minLength: 20 },
  { prefix: "shpat_", minLength: 20 },
];

function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const ENTROPY_THRESHOLDS: Record<string, number> = {
  strict: 3.0,
  balanced: 3.5,
  permissive: 4.0,
};

const MIN_TOKEN_LENGTH: Record<string, number> = {
  strict: 16,
  balanced: 20,
  permissive: 24,
};

// Matches alphanumeric strings with mixed case/digits that look like tokens
const TOKEN_PATTERN = /\b[A-Za-z0-9_-]{16,}\b/g;

export function secretKeyGuardrail(
  config?: SecretKeyGuardrailConfig,
): Guardrail {
  const sensitivity = config?.sensitivity ?? "balanced";
  const name = config?.name ?? "secret_key_guardrail";
  const entropyThreshold = ENTROPY_THRESHOLDS[sensitivity];
  const minLength = MIN_TOKEN_LENGTH[sensitivity];

  return {
    name,
    execute: (_ctx, input) => {
      const texts = extractTextContent(input.messages);
      const detectedTypes = new Set<string>();

      for (const text of texts) {
        // Check known prefixes first
        for (const { prefix, minLength: prefixMinLen } of KNOWN_PREFIXES) {
          const idx = text.indexOf(prefix);
          if (idx === -1) continue;
          // Extract the token starting at the prefix
          const remaining = text.slice(idx);
          const match = remaining.match(/^[A-Za-z0-9_-]+/);
          if (match && match[0].length >= prefixMinLen) {
            detectedTypes.add(prefix);
          }
        }

        // Entropy-based detection for unknown token formats
        if (sensitivity !== "permissive") {
          const tokens = text.matchAll(TOKEN_PATTERN);
          for (const m of tokens) {
            const token = m[0];
            if (token.length < minLength) continue;
            // Skip if it's already caught by prefix matching
            if (
              KNOWN_PREFIXES.some(
                (p) =>
                  token.startsWith(p.prefix) && detectedTypes.has(p.prefix),
              )
            )
              continue;
            const entropy = shannonEntropy(token);
            if (entropy >= entropyThreshold) {
              // Check character diversity (needs mixed case or digits)
              const hasLower = /[a-z]/.test(token);
              const hasUpper = /[A-Z]/.test(token);
              const hasDigit = /\d/.test(token);
              const diversity =
                (hasLower ? 1 : 0) + (hasUpper ? 1 : 0) + (hasDigit ? 1 : 0);
              if (diversity >= 2) {
                detectedTypes.add("high-entropy-token");
              }
            }
          }
        }
      }

      if (detectedTypes.size > 0) {
        const list = [...detectedTypes];
        return Promise.resolve({
          tripwired: true,
          reason: `Potential secret key(s) detected: ${list.join(", ")}`,
          metadata: { detectedTypes: list },
        });
      }

      return Promise.resolve({ tripwired: false });
    },
  };
}
