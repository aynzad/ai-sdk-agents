import type {
  CallSettings,
  LanguageModel,
  ModelMessage,
  Tool,
  ToolSet,
  LanguageModelUsage,
} from "ai";

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
