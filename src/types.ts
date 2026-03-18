import type {
  CallSettings,
  LanguageModel,
  ModelMessage,
  Tool,
  ToolSet,
  LanguageModelUsage,
} from "ai";
import type { GuardrailResult } from "@/guardrail/types";
import type { TracingConfig } from "@/tracing/types";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface RunContext<TContext = unknown> {
  context: TContext;
  agent: string;
  traceId: string;
  turn: number;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Model settings
// ---------------------------------------------------------------------------

/**
 * Model-level settings passed through to `generateText` / `streamText`.
 * Alias for the AI SDK's `CallSettings` so users can configure temperature,
 * maxOutputTokens, topP, seed, retries, timeout, etc. at the agent level.
 */
export type ModelSettings = CallSettings;

// ---------------------------------------------------------------------------
// Run hooks
// ---------------------------------------------------------------------------

export interface RunHooks<TContext = unknown> {
  onRunStart?(ctx: RunContext<TContext>): void | Promise<void>;
  onRunEnd?(
    ctx: RunContext<TContext>,
    result: RunResult<unknown>,
  ): void | Promise<void>;
  onAgentStart?(ctx: RunContext<TContext>): void | Promise<void>;
  onAgentEnd?(ctx: RunContext<TContext>, output: string): void | Promise<void>;
  onHandoff?(
    ctx: RunContext<TContext>,
    from: string,
    to: string,
  ): void | Promise<void>;
  onGuardrailTripped?(
    ctx: RunContext<TContext>,
    result: GuardrailResult,
  ): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface RunConfig<TContext = unknown> {
  maxTurns?: number;
  context?: TContext;
  model?: LanguageModel;
  tracing?: TracingConfig;
  hooks?: RunHooks<TContext>;
  signal?: AbortSignal;
}

export interface RunStep {
  type: "message" | "tool_call" | "tool_result" | "handoff" | "guardrail";
  agent: string;
  timestamp: number;
  data: unknown;
}

export interface RunResult<TOutput = string> {
  output: TOutput;
  agent: string;
  steps: RunStep[];
  usage: Pick<
    LanguageModelUsage,
    "inputTokens" | "outputTokens" | "totalTokens"
  >;
  traceId?: string;
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

export type StreamEvent =
  | { type: "agent_start"; agent: string; timestamp: number }
  | { type: "agent_end"; agent: string; timestamp: number }
  | { type: "text_delta"; delta: string; agent: string }
  | { type: "tool_call_start"; toolName: string; agent: string; args: unknown }
  | { type: "tool_call_end"; toolName: string; agent: string; output: unknown }
  | { type: "handoff"; from: string; to: string; timestamp: number }
  | { type: "guardrail_start"; name: string; agent: string }
  | { type: "guardrail_end"; name: string; tripwired: boolean }
  | { type: "error"; error: Error; agent: string }
  | { type: "done"; result: RunResult<unknown> };

export interface StreamResult<TOutput = string> {
  events: AsyncIterable<StreamEvent>;
  result: Promise<RunResult<TOutput>>;
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class MaxTurnsExceededError extends Error {
  readonly maxTurns: number;

  constructor(maxTurns: number) {
    super(`Maximum turns (${maxTurns}) exceeded`);
    this.name = "MaxTurnsExceededError";
    this.maxTurns = maxTurns;
  }
}

// Re-export AI SDK types used across the library so consumers only need
// to import from this package.
export type {
  CallSettings,
  LanguageModel,
  ModelMessage,
  Tool,
  ToolSet,
  LanguageModelUsage,
};
