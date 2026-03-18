import type { RunContext } from "@/types";
import type {
  Guardrail,
  GuardrailInput,
  GuardrailResult,
} from "@/guardrail/types";
import type { LanguageModel, ModelMessage } from "ai";
import { generateText } from "ai";

// ---------------------------------------------------------------------------
// Content extraction helper
// ---------------------------------------------------------------------------

export function extractTextContent(messages: ModelMessage[]): string[] {
  const texts: string[] = [];
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      texts.push(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if ("type" in part && part.type === "text" && "text" in part) {
          texts.push((part as { text: string }).text);
        }
      }
    }
  }
  return texts;
}

// ---------------------------------------------------------------------------
// guardrail() — factory
// ---------------------------------------------------------------------------

export function guardrail<TContext = unknown>(config: {
  name: string;
  execute: (
    ctx: RunContext<TContext>,
    input: GuardrailInput,
  ) => Promise<GuardrailResult>;
}): Guardrail<TContext> {
  if (!config.name || typeof config.name !== "string") {
    throw new Error("Guardrail name must be a non-empty string");
  }
  if (typeof config.execute !== "function") {
    throw new Error("Guardrail execute must be a function");
  }
  return { name: config.name, execute: config.execute };
}

// ---------------------------------------------------------------------------
// llmGuardrail() — LLM-powered guardrail
// ---------------------------------------------------------------------------

export interface LlmGuardrailConfig<TContext = unknown> {
  name: string;
  model: LanguageModel;
  promptBuilder: (ctx: RunContext<TContext>, input: GuardrailInput) => string;
  tripWhen: (text: string) => boolean;
}

export function llmGuardrail<TContext = unknown>(
  config: LlmGuardrailConfig<TContext>,
): Guardrail<TContext> {
  return {
    name: config.name,
    execute: async (ctx, input) => {
      try {
        const prompt = config.promptBuilder(ctx, input);
        const result = await generateText({
          model: config.model,
          prompt,
        });
        const tripped = config.tripWhen(result.text);
        return {
          tripwired: tripped,
          reason: tripped
            ? `LLM guardrail "${config.name}" triggered`
            : undefined,
        };
      } catch {
        return {
          tripwired: true,
          reason: `LLM guardrail "${config.name}" failed — treating as tripwire for safety`,
        };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// runGuardrails() — parallel executor
// ---------------------------------------------------------------------------

export async function runGuardrails<TContext = unknown>(
  guardrails: Guardrail<TContext>[],
  ctx: RunContext<TContext>,
  input: GuardrailInput,
): Promise<GuardrailResult & { guardrailName?: string }> {
  if (guardrails.length === 0) {
    return { tripwired: false };
  }

  const settled = await Promise.allSettled(
    guardrails.map((g) =>
      g.execute(ctx, input).then((r) => ({ ...r, guardrailName: g.name })),
    ),
  );

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === "rejected") {
      return {
        tripwired: true,
        guardrailName: guardrails[i].name,
        reason: `Guardrail "${guardrails[i].name}" threw: ${String(outcome.reason)}`,
      };
    }
    if (outcome.value.tripwired) {
      return outcome.value;
    }
  }

  return { tripwired: false };
}

// ---------------------------------------------------------------------------
// Built-in: keywordGuardrail
// ---------------------------------------------------------------------------

export function keywordGuardrail(opts: {
  blockedKeywords: string[];
  caseSensitive?: boolean;
}): Guardrail {
  return {
    name: "keyword_guardrail",
    execute: (_ctx, input) => {
      const texts = extractTextContent(input.messages);
      const sensitive = opts.caseSensitive ?? false;

      for (const text of texts) {
        const haystack = sensitive ? text : text.toLowerCase();
        for (const kw of opts.blockedKeywords) {
          const needle = sensitive ? kw : kw.toLowerCase();
          if (haystack.includes(needle)) {
            return Promise.resolve({
              tripwired: true,
              reason: `Blocked keyword "${kw}" found in message`,
            });
          }
        }
      }

      return Promise.resolve({ tripwired: false });
    },
  };
}

// ---------------------------------------------------------------------------
// Built-in: maxLengthGuardrail
// ---------------------------------------------------------------------------

export function maxLengthGuardrail(opts: { maxLength: number }): Guardrail {
  return {
    name: "max_length_guardrail",
    execute: (_ctx, input) => {
      const texts = extractTextContent(input.messages);

      for (const text of texts) {
        if (text.length > opts.maxLength) {
          return Promise.resolve({
            tripwired: true,
            reason: `Message length ${text.length} exceeds max ${opts.maxLength}`,
          });
        }
      }

      return Promise.resolve({ tripwired: false });
    },
  };
}

// ---------------------------------------------------------------------------
// Built-in: regexGuardrail
// ---------------------------------------------------------------------------

export function regexGuardrail(opts: {
  pattern: RegExp;
  reason?: string;
}): Guardrail {
  return {
    name: "regex_guardrail",
    execute: (_ctx, input) => {
      const texts = extractTextContent(input.messages);

      for (const text of texts) {
        if (opts.pattern.test(text)) {
          return Promise.resolve({
            tripwired: true,
            reason: opts.reason ?? `Pattern ${String(opts.pattern)} matched`,
          });
        }
      }

      return Promise.resolve({ tripwired: false });
    },
  };
}
