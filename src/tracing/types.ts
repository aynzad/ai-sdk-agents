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
