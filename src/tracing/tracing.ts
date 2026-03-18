import type { TraceSpan, TraceProcessor } from "@/tracing/types";

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let idCounter = 0;

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${(idCounter++).toString(36)}`;
}

// ---------------------------------------------------------------------------
// Global processor registry
// ---------------------------------------------------------------------------

const globalProcessors = new Set<TraceProcessor>();

export function addTraceProcessor(processor: TraceProcessor): void {
  globalProcessors.add(processor);
}

export function removeTraceProcessor(processor: TraceProcessor): void {
  globalProcessors.delete(processor);
}

export function clearTraceProcessors(): void {
  globalProcessors.clear();
}

// ---------------------------------------------------------------------------
// SpanHandle
// ---------------------------------------------------------------------------

export interface SpanHandle {
  setAttribute(key: string, value: unknown): void;
  end(): void;
}

// ---------------------------------------------------------------------------
// SpanConfig (input to Trace.span())
// ---------------------------------------------------------------------------

export interface SpanConfig {
  name: string;
  type: TraceSpan["type"];
  parentSpanId?: string;
}

// ---------------------------------------------------------------------------
// Trace class
// ---------------------------------------------------------------------------

export class Trace {
  readonly traceId: string;
  private readonly processors: TraceProcessor[];
  private readonly completedSpans: TraceSpan[] = [];
  private ended = false;

  readonly name: string;

  constructor(name: string, processors?: TraceProcessor[]) {
    this.name = name;
    this.traceId = generateId();
    this.processors = [...globalProcessors, ...(processors ?? [])];

    for (const p of this.processors) {
      try {
        void p.onTraceStart(this.traceId);
      } catch {
        // Processor errors never break the trace
      }
    }
  }

  span(config: SpanConfig): SpanHandle {
    const spanData: TraceSpan = {
      traceId: this.traceId,
      spanId: generateId(),
      name: config.name,
      type: config.type,
      startTime: Date.now(),
      attributes: {},
    };

    if (config.parentSpanId !== undefined) {
      spanData.parentSpanId = config.parentSpanId;
    }

    let spanEnded = false;

    return {
      setAttribute(key: string, value: unknown): void {
        spanData.attributes[key] = value;
      },
      end: () => {
        if (spanEnded) return;
        spanEnded = true;

        spanData.endTime = Date.now();
        this.completedSpans.push(spanData);

        for (const p of this.processors) {
          try {
            void p.onSpan(spanData);
          } catch {
            // Processor errors never break the trace
          }
        }
      },
    };
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;

    for (const p of this.processors) {
      try {
        void p.onTraceEnd(this.traceId);
      } catch {
        // Processor errors never break the trace
      }
    }
  }

  getSpans(): TraceSpan[] {
    return [...this.completedSpans];
  }
}

// ---------------------------------------------------------------------------
// trace() convenience function
// ---------------------------------------------------------------------------

export async function trace<T>(
  name: string,
  fn: (t: Trace) => Promise<T>,
  config?: { processors?: TraceProcessor[] },
): Promise<T> {
  const t = new Trace(name, config?.processors);
  try {
    const result = await fn(t);
    t.end();
    return result;
  } catch (err) {
    const errorSpan = t.span({ name: "error", type: "custom" });
    errorSpan.setAttribute(
      "error",
      err instanceof Error ? err.message : String(err),
    );
    errorSpan.end();
    t.end();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Built-in: consoleTraceProcessor
// ---------------------------------------------------------------------------

export function consoleTraceProcessor(): TraceProcessor {
  return {
    onTraceStart(traceId: string): void {
      console.log(`[Trace ${traceId}] Started`);
    },
    onSpan(span: TraceSpan): void {
      const duration =
        span.endTime !== undefined ? span.endTime - span.startTime : "?";
      console.log(
        `[Trace ${span.traceId}] Span ${span.name} (${span.type}) ${duration}ms`,
      );
    },
    onTraceEnd(traceId: string): void {
      console.log(`[Trace ${traceId}] Ended`);
    },
  };
}

// ---------------------------------------------------------------------------
// Built-in: memoryTraceProcessor
// ---------------------------------------------------------------------------

export function memoryTraceProcessor(): TraceProcessor & {
  getTraces(): Map<string, TraceSpan[]>;
  clear(): void;
} {
  const storage = new Map<string, TraceSpan[]>();

  return {
    onTraceStart(traceId: string): void {
      storage.set(traceId, []);
    },
    onSpan(span: TraceSpan): void {
      const spans = storage.get(span.traceId);
      if (spans) {
        spans.push(span);
      }
    },
    onTraceEnd(): void {
      // Data persists after trace ends
    },
    getTraces(): Map<string, TraceSpan[]> {
      return storage;
    },
    clear(): void {
      storage.clear();
    },
  };
}
