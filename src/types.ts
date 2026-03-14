import type {
  LanguageModel,
  ModelMessage,
  Tool,
  ToolSet,
  LanguageModelUsage,
} from "ai";
import type { z } from "zod";

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

export interface ModelSettings {
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
}

// ---------------------------------------------------------------------------
// Agent hooks
// ---------------------------------------------------------------------------

export interface AgentHooks<TContext = unknown> {
  onStart?(ctx: RunContext<TContext>): void | Promise<void>;
  onEnd?(ctx: RunContext<TContext>, output: string): void | Promise<void>;
  onToolCall?(
    ctx: RunContext<TContext>,
    toolName: string,
    args: unknown,
  ): void | Promise<void>;
  onToolResult?(
    ctx: RunContext<TContext>,
    toolName: string,
    result: unknown,
  ): void | Promise<void>;
  onHandoff?(ctx: RunContext<TContext>, target: string): void | Promise<void>;
  onError?(ctx: RunContext<TContext>, error: Error): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export interface AsToolOptions {
  toolName?: string;
  toolDescription?: string;
}

export interface AgentConfig<TContext = unknown, TOutput = string> {
  name: string;
  instructions:
    | string
    | ((ctx: RunContext<TContext>) => string | Promise<string>);
  model: LanguageModel;
  tools?: ToolSet;
  handoffs?: HandoffTarget<TContext>[];
  inputGuardrails?: Guardrail<TContext>[];
  outputGuardrails?: Guardrail<TContext>[];
  outputSchema?: z.ZodType<TOutput>;
  hooks?: AgentHooks<TContext>;
  modelSettings?: ModelSettings;
  maxToolRoundtrips?: number;
}

export interface AgentInstance<TContext = unknown, TOutput = string> {
  readonly name: string;
  readonly config: AgentConfig<TContext, TOutput>;
  asTool(options?: AsToolOptions): Tool;
  clone(
    overrides: Partial<AgentConfig<TContext, TOutput>>,
  ): AgentInstance<TContext, TOutput>;
}

// ---------------------------------------------------------------------------
// Handoffs
// ---------------------------------------------------------------------------

export interface HandoffConfig<TContext = unknown> {
  agent: AgentInstance<TContext, unknown>;
  toolName?: string;
  toolDescription?: string;
  onHandoff?: (ctx: RunContext<TContext>) => void | Promise<void>;
  inputFilter?: (messages: ModelMessage[]) => ModelMessage[];
}

export type HandoffTarget<TContext = unknown> =
  | AgentInstance<TContext, unknown>
  | HandoffConfig<TContext>;

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

export interface GuardrailInput {
  messages: ModelMessage[];
  agentName: string;
}

export interface GuardrailResult {
  tripwired: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface Guardrail<TContext = unknown> {
  name: string;
  execute: (
    ctx: RunContext<TContext>,
    input: GuardrailInput,
  ) => Promise<GuardrailResult>;
}

// ---------------------------------------------------------------------------
// Tool guardrails
// ---------------------------------------------------------------------------

export type ToolGuardrailBehavior =
  | { type: "allow" }
  | { type: "rejectContent"; message: string }
  | {
      type: "throwException";
      reason?: string;
      metadata?: Record<string, unknown>;
    };

export interface ToolInputGuardrailData<TContext = unknown> {
  toolName: string;
  toolCallId: string;
  input: unknown;
  ctx: RunContext<TContext>;
}

export interface ToolOutputGuardrailData<TContext = unknown> {
  toolName: string;
  toolCallId: string;
  input: unknown;
  output: unknown;
  ctx: RunContext<TContext>;
}

export interface ToolInputGuardrail<TContext = unknown> {
  name: string;
  execute: (
    data: ToolInputGuardrailData<TContext>,
  ) => Promise<ToolGuardrailBehavior>;
}

export interface ToolOutputGuardrail<TContext = unknown> {
  name: string;
  execute: (
    data: ToolOutputGuardrailData<TContext>,
  ) => Promise<ToolGuardrailBehavior>;
}

// ---------------------------------------------------------------------------
// Tracing
// ---------------------------------------------------------------------------

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  type: "agent" | "llm" | "tool" | "guardrail" | "handoff" | "custom";
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown>;
}

export interface TraceProcessor {
  onTraceStart(traceId: string): void | Promise<void>;
  onSpan(span: TraceSpan): void | Promise<void>;
  onTraceEnd(traceId: string): void | Promise<void>;
}

export interface TracingConfig {
  enabled?: boolean;
  traceId?: string;
  groupId?: string;
  processors?: TraceProcessor[];
  redactInput?: boolean;
  redactOutput?: boolean;
}

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

export class GuardrailTripwiredError extends Error {
  readonly guardrailName: string;
  readonly reason?: string;
  readonly metadata?: Record<string, unknown>;

  constructor(
    guardrailName: string,
    reason?: string,
    metadata?: Record<string, unknown>,
  ) {
    const message = reason
      ? `Guardrail "${guardrailName}" tripped: ${reason}`
      : `Guardrail "${guardrailName}" tripped`;
    super(message);
    this.name = "GuardrailTripwiredError";
    this.guardrailName = guardrailName;
    this.reason = reason;
    this.metadata = metadata;
  }
}

export class MaxTurnsExceededError extends Error {
  readonly maxTurns: number;

  constructor(maxTurns: number) {
    super(`Maximum turns (${maxTurns}) exceeded`);
    this.name = "MaxTurnsExceededError";
    this.maxTurns = maxTurns;
  }
}

export class HandoffError extends Error {
  readonly fromAgent: string;
  readonly toAgent: string;

  constructor(fromAgent: string, toAgent: string, detail: string) {
    super(`Handoff from "${fromAgent}" to "${toAgent}" failed: ${detail}`);
    this.name = "HandoffError";
    this.fromAgent = fromAgent;
    this.toAgent = toAgent;
  }
}

export class ToolGuardrailTripwiredError extends Error {
  readonly guardrailName: string;
  readonly toolName: string;
  readonly reason?: string;
  readonly metadata?: Record<string, unknown>;

  constructor(
    guardrailName: string,
    toolName: string,
    reason?: string,
    metadata?: Record<string, unknown>,
  ) {
    const message = reason
      ? `Tool guardrail "${guardrailName}" tripped on tool "${toolName}": ${reason}`
      : `Tool guardrail "${guardrailName}" tripped on tool "${toolName}"`;
    super(message);
    this.name = "ToolGuardrailTripwiredError";
    this.guardrailName = guardrailName;
    this.toolName = toolName;
    this.reason = reason;
    this.metadata = metadata;
  }
}

// Re-export AI SDK types used across the library so consumers only need
// to import from this package.
export type { LanguageModel, ModelMessage, Tool, ToolSet, LanguageModelUsage };
