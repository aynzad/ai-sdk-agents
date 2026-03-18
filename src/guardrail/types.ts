import type { ModelMessage } from "ai";
import type { RunContext } from "@/types";

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
