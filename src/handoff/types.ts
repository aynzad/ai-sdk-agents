import type { ModelMessage } from "ai";
import type { AgentInstance } from "@/agent/types";
import type { RunContext } from "@/types";

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
// Error classes
// ---------------------------------------------------------------------------

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
