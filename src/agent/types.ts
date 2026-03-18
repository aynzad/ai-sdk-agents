import type { LanguageModel, Tool, ToolSet } from "ai";
import type { z } from "zod";
import type { RunContext, ModelSettings } from "@/types";
import type { Guardrail, HandoffTarget } from "@/types";

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
  clientTools?: ToolSet;
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
