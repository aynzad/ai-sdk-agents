import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TraceSpan } from "@/types";
import {
  Trace,
  trace,
  addTraceProcessor,
  removeTraceProcessor,
  clearTraceProcessors,
  consoleTraceProcessor,
  memoryTraceProcessor,
} from "./tracing";
import { createMockProcessor } from "@/test";

/* eslint-disable @typescript-eslint/unbound-method */

// ---------------------------------------------------------------------------
// Cleanup global state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearTraceProcessors();
});

afterEach(() => {
  clearTraceProcessors();
});

// ---------------------------------------------------------------------------
// ID generation (tested indirectly via Trace)
// ---------------------------------------------------------------------------

describe("ID generation", () => {
  it("should generate unique traceIds for different traces", () => {
    const t1 = new Trace("trace-1");
    const t2 = new Trace("trace-2");

    expect(t1.traceId).not.toBe(t2.traceId);
  });

  it("should generate a non-empty string traceId", () => {
    const t = new Trace("test");

    expect(typeof t.traceId).toBe("string");
    expect(t.traceId.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Trace class
// ---------------------------------------------------------------------------

describe("Trace", () => {
  it("should set a unique traceId on construction", () => {
    const t = new Trace("my-trace");

    expect(t.traceId).toBeDefined();
    expect(typeof t.traceId).toBe("string");
    expect(t.traceId.length).toBeGreaterThan(0);
  });

  it("should notify processors via onTraceStart on construction", () => {
    const processor = createMockProcessor();

    const t = new Trace("my-trace", [processor]);

    expect(processor.onTraceStart).toHaveBeenCalledOnce();
    expect(processor.onTraceStart).toHaveBeenCalledWith(t.traceId);
  });

  it("should not throw when constructed with no processors", () => {
    expect(() => new Trace("my-trace")).not.toThrow();
  });

  it("should return a SpanHandle from span() with setAttribute and end methods", () => {
    const t = new Trace("my-trace");
    const handle = t.span({ name: "test-span", type: "custom" });

    expect(typeof handle.setAttribute).toBe("function");
    expect(typeof handle.end).toBe("function");
  });

  it("should create spans with the correct traceId", () => {
    const processor = createMockProcessor();
    const t = new Trace("my-trace", [processor]);
    const handle = t.span({ name: "test-span", type: "agent" });
    handle.end();

    const span = (processor.onSpan as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceSpan;
    expect(span.traceId).toBe(t.traceId);
  });

  it("should create spans with the correct name and type", () => {
    const processor = createMockProcessor();
    const t = new Trace("my-trace", [processor]);
    const handle = t.span({ name: "llm-call", type: "llm" });
    handle.end();

    const span = (processor.onSpan as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceSpan;
    expect(span.name).toBe("llm-call");
    expect(span.type).toBe("llm");
  });

  it("should create spans with parentSpanId when provided", () => {
    const processor = createMockProcessor();
    const t = new Trace("my-trace", [processor]);
    const handle = t.span({
      name: "child-span",
      type: "tool",
      parentSpanId: "parent-123",
    });
    handle.end();

    const span = (processor.onSpan as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceSpan;
    expect(span.parentSpanId).toBe("parent-123");
  });

  it("should set startTime on span creation", () => {
    const processor = createMockProcessor();
    const before = Date.now();
    const t = new Trace("my-trace", [processor]);
    const handle = t.span({ name: "timed", type: "custom" });
    const after = Date.now();
    handle.end();

    const span = (processor.onSpan as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceSpan;
    expect(span.startTime).toBeGreaterThanOrEqual(before);
    expect(span.startTime).toBeLessThanOrEqual(after);
  });

  it("should return empty array from getSpans() before any spans end", () => {
    const t = new Trace("my-trace");
    t.span({ name: "open-span", type: "custom" });

    expect(t.getSpans()).toEqual([]);
  });

  it("should return completed spans from getSpans() after spanHandle.end()", () => {
    const t = new Trace("my-trace");
    const handle = t.span({ name: "done-span", type: "agent" });
    handle.end();

    const spans = t.getSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("done-span");
  });

  it("should return a copy from getSpans() (mutating does not affect trace)", () => {
    const t = new Trace("my-trace");
    const handle = t.span({ name: "span-1", type: "custom" });
    handle.end();

    const spans = t.getSpans();
    spans.length = 0;

    expect(t.getSpans()).toHaveLength(1);
  });

  it("should call onTraceEnd on all processors when end() is called", () => {
    const p1 = createMockProcessor();
    const p2 = createMockProcessor();
    const t = new Trace("my-trace", [p1, p2]);

    t.end();

    expect(p1.onTraceEnd).toHaveBeenCalledOnce();
    expect(p1.onTraceEnd).toHaveBeenCalledWith(t.traceId);
    expect(p2.onTraceEnd).toHaveBeenCalledOnce();
    expect(p2.onTraceEnd).toHaveBeenCalledWith(t.traceId);
  });

  it("should be idempotent — second end() does not notify again", () => {
    const processor = createMockProcessor();
    const t = new Trace("my-trace", [processor]);

    t.end();
    t.end();

    expect(processor.onTraceEnd).toHaveBeenCalledOnce();
  });

  it("should not throw when processor.onTraceStart throws", () => {
    const badProcessor = createMockProcessor({
      onTraceStart: vi.fn(() => {
        throw new Error("processor exploded");
      }),
    });

    expect(() => new Trace("my-trace", [badProcessor])).not.toThrow();
  });

  it("should not throw when processor.onTraceEnd throws", () => {
    const badProcessor = createMockProcessor({
      onTraceEnd: vi.fn(() => {
        throw new Error("processor exploded");
      }),
    });
    const t = new Trace("my-trace", [badProcessor]);

    expect(() => t.end()).not.toThrow();
  });

  it("should merge per-trace processors with global processors", () => {
    const globalProc = createMockProcessor();
    const localProc = createMockProcessor();

    addTraceProcessor(globalProc);
    const t = new Trace("my-trace", [localProc]);

    expect(globalProc.onTraceStart).toHaveBeenCalledOnce();
    expect(localProc.onTraceStart).toHaveBeenCalledOnce();

    t.end();

    expect(globalProc.onTraceEnd).toHaveBeenCalledOnce();
    expect(localProc.onTraceEnd).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// SpanHandle
// ---------------------------------------------------------------------------

describe("SpanHandle", () => {
  it("should set a key-value attribute via setAttribute()", () => {
    const processor = createMockProcessor();
    const t = new Trace("my-trace", [processor]);
    const handle = t.span({ name: "attr-span", type: "custom" });

    handle.setAttribute("model", "gpt-4");
    handle.end();

    const span = (processor.onSpan as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceSpan;
    expect(span.attributes.model).toBe("gpt-4");
  });

  it("should allow multiple setAttribute() calls", () => {
    const processor = createMockProcessor();
    const t = new Trace("my-trace", [processor]);
    const handle = t.span({ name: "multi-attr", type: "llm" });

    handle.setAttribute("model", "gpt-4");
    handle.setAttribute("tokens", 150);
    handle.setAttribute("cached", true);
    handle.end();

    const span = (processor.onSpan as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceSpan;
    expect(span.attributes).toEqual({
      model: "gpt-4",
      tokens: 150,
      cached: true,
    });
  });

  it("should set endTime when end() is called", () => {
    const processor = createMockProcessor();
    const t = new Trace("my-trace", [processor]);
    const handle = t.span({ name: "timed-span", type: "custom" });

    const before = Date.now();
    handle.end();
    const after = Date.now();

    const span = (processor.onSpan as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceSpan;
    expect(span.endTime).toBeGreaterThanOrEqual(before);
    expect(span.endTime).toBeLessThanOrEqual(after);
  });

  it("should call onSpan on all processors when end() is called", () => {
    const p1 = createMockProcessor();
    const p2 = createMockProcessor();
    const t = new Trace("my-trace", [p1, p2]);
    const handle = t.span({ name: "broadcast-span", type: "agent" });

    handle.end();

    expect(p1.onSpan).toHaveBeenCalledOnce();
    expect(p2.onSpan).toHaveBeenCalledOnce();
  });

  it("should be idempotent — second end() does not notify again", () => {
    const processor = createMockProcessor();
    const t = new Trace("my-trace", [processor]);
    const handle = t.span({ name: "idempotent-span", type: "custom" });

    handle.end();
    handle.end();

    expect(processor.onSpan).toHaveBeenCalledOnce();
  });

  it("should not throw when processor.onSpan throws", () => {
    const badProcessor = createMockProcessor({
      onSpan: vi.fn(() => {
        throw new Error("onSpan exploded");
      }),
    });
    const t = new Trace("my-trace", [badProcessor]);
    const handle = t.span({ name: "safe-span", type: "custom" });

    expect(() => handle.end()).not.toThrow();
  });

  it("should have empty attributes object initially", () => {
    const processor = createMockProcessor();
    const t = new Trace("my-trace", [processor]);
    const handle = t.span({ name: "empty-attrs", type: "custom" });
    handle.end();

    const span = (processor.onSpan as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceSpan;
    expect(span.attributes).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// trace() convenience function
// ---------------------------------------------------------------------------

describe("trace()", () => {
  it("should auto-create and close trace on success", async () => {
    const processor = createMockProcessor();
    addTraceProcessor(processor);

    await trace("test-trace", () => Promise.resolve("done"));

    expect(processor.onTraceStart).toHaveBeenCalledOnce();
    expect(processor.onTraceEnd).toHaveBeenCalledOnce();
  });

  it("should return the function result", async () => {
    const result = await trace("test-trace", () => Promise.resolve(42));

    expect(result).toBe(42);
  });

  it("should capture errors as spans before rethrowing", async () => {
    const processor = createMockProcessor();
    addTraceProcessor(processor);

    await expect(
      trace("error-trace", () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");

    expect(processor.onSpan).toHaveBeenCalledOnce();
  });

  it("should create an error span with type custom and error attribute", async () => {
    const processor = createMockProcessor();
    addTraceProcessor(processor);

    await expect(
      trace("error-trace", () => Promise.reject(new Error("test failure"))),
    ).rejects.toThrow();

    const span = (processor.onSpan as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceSpan;
    expect(span.type).toBe("custom");
    expect(span.attributes.error).toBe("test failure");
  });

  it("should call trace.end() even on error", async () => {
    const processor = createMockProcessor();
    addTraceProcessor(processor);

    await expect(
      trace("error-trace", () => Promise.reject(new Error("fail"))),
    ).rejects.toThrow();

    expect(processor.onTraceEnd).toHaveBeenCalledOnce();
  });

  it("should pass the Trace instance to the function", async () => {
    let receivedTrace: Trace | undefined;

    await trace("pass-trace", (t) => {
      receivedTrace = t;
      return Promise.resolve();
    });

    expect(receivedTrace).toBeInstanceOf(Trace);
  });

  it("should handle non-Error thrown values in error span", async () => {
    const processor = createMockProcessor();
    addTraceProcessor(processor);

    await expect(
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      trace("string-error-trace", () => Promise.reject("string error")),
    ).rejects.toBe("string error");

    const span = (processor.onSpan as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceSpan;
    expect(span.attributes.error).toBe("string error");
  });

  it("should accept optional processors config", async () => {
    const localProc = createMockProcessor();

    await trace("config-trace", () => Promise.resolve("ok"), {
      processors: [localProc],
    });

    expect(localProc.onTraceStart).toHaveBeenCalledOnce();
    expect(localProc.onTraceEnd).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Global processor management
// ---------------------------------------------------------------------------

describe("Global processor management", () => {
  it("should add a processor that receives events via addTraceProcessor", () => {
    const processor = createMockProcessor();
    addTraceProcessor(processor);

    const t = new Trace("global-test");
    t.end();

    expect(processor.onTraceStart).toHaveBeenCalledOnce();
    expect(processor.onTraceEnd).toHaveBeenCalledOnce();
  });

  it("should stop receiving events after removeTraceProcessor", () => {
    const processor = createMockProcessor();
    addTraceProcessor(processor);
    removeTraceProcessor(processor);

    const t = new Trace("removed-test");
    t.end();

    expect(processor.onTraceStart).not.toHaveBeenCalled();
    expect(processor.onTraceEnd).not.toHaveBeenCalled();
  });

  it("should remove all processors via clearTraceProcessors", () => {
    const p1 = createMockProcessor();
    const p2 = createMockProcessor();
    addTraceProcessor(p1);
    addTraceProcessor(p2);

    clearTraceProcessors();

    const t = new Trace("cleared-test");
    t.end();

    expect(p1.onTraceStart).not.toHaveBeenCalled();
    expect(p2.onTraceStart).not.toHaveBeenCalled();
  });

  it("should not throw when removing a non-registered processor", () => {
    const processor = createMockProcessor();

    expect(() => removeTraceProcessor(processor)).not.toThrow();
  });

  it("should pick up global processors for new Trace instances", () => {
    const processor = createMockProcessor();

    const t1 = new Trace("before-add");
    addTraceProcessor(processor);
    const t2 = new Trace("after-add");

    t1.end();
    t2.end();

    expect(processor.onTraceStart).toHaveBeenCalledOnce();
    expect(processor.onTraceStart).toHaveBeenCalledWith(t2.traceId);
  });
});

// ---------------------------------------------------------------------------
// consoleTraceProcessor
// ---------------------------------------------------------------------------

describe("consoleTraceProcessor", () => {
  it("should log on onTraceStart", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const processor = consoleTraceProcessor();

    void processor.onTraceStart("trace-abc");

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("trace-abc");
    expect(spy.mock.calls[0][0]).toContain("Started");
    spy.mockRestore();
  });

  it("should log span details on onSpan including duration", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const processor = consoleTraceProcessor();
    const span: TraceSpan = {
      traceId: "trace-abc",
      spanId: "span-1",
      name: "llm-call",
      type: "llm",
      startTime: 1000,
      endTime: 1250,
      attributes: {},
    };

    void processor.onSpan(span);

    expect(spy).toHaveBeenCalledOnce();
    const logMsg = spy.mock.calls[0][0] as string;
    expect(logMsg).toContain("trace-abc");
    expect(logMsg).toContain("llm-call");
    expect(logMsg).toContain("llm");
    expect(logMsg).toContain("250");
    spy.mockRestore();
  });

  it("should handle span with undefined endTime gracefully", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const processor = consoleTraceProcessor();
    const span: TraceSpan = {
      traceId: "trace-abc",
      spanId: "span-1",
      name: "open-span",
      type: "custom",
      startTime: 1000,
      attributes: {},
    };

    void processor.onSpan(span);

    expect(spy).toHaveBeenCalledOnce();
    const logMsg = spy.mock.calls[0][0] as string;
    expect(logMsg).toContain("?");
    spy.mockRestore();
  });

  it("should log on onTraceEnd", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const processor = consoleTraceProcessor();

    void processor.onTraceEnd("trace-abc");

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("trace-abc");
    expect(spy.mock.calls[0][0]).toContain("Ended");
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// memoryTraceProcessor
// ---------------------------------------------------------------------------

describe("memoryTraceProcessor", () => {
  it("should store spans grouped by traceId", () => {
    const processor = memoryTraceProcessor();
    const span: TraceSpan = {
      traceId: "trace-1",
      spanId: "span-1",
      name: "test-span",
      type: "agent",
      startTime: 1000,
      endTime: 2000,
      attributes: {},
    };

    void processor.onTraceStart("trace-1");
    void processor.onSpan(span);

    const traces = processor.getTraces();
    expect(traces.get("trace-1")).toHaveLength(1);
    expect(traces.get("trace-1")![0].name).toBe("test-span");
  });

  it("should return stored data via getTraces()", () => {
    const processor = memoryTraceProcessor();

    void processor.onTraceStart("trace-1");
    void processor.onSpan({
      traceId: "trace-1",
      spanId: "span-1",
      name: "a",
      type: "llm",
      startTime: 100,
      endTime: 200,
      attributes: {},
    });

    const traces = processor.getTraces();
    expect(traces.size).toBe(1);
    expect(traces.has("trace-1")).toBe(true);
  });

  it("should remove all stored data via clear()", () => {
    const processor = memoryTraceProcessor();

    void processor.onTraceStart("trace-1");
    void processor.onSpan({
      traceId: "trace-1",
      spanId: "span-1",
      name: "a",
      type: "llm",
      startTime: 100,
      endTime: 200,
      attributes: {},
    });

    processor.clear();

    expect(processor.getTraces().size).toBe(0);
  });

  it("should not lose data when onTraceEnd is called", () => {
    const processor = memoryTraceProcessor();

    void processor.onTraceStart("trace-1");
    void processor.onSpan({
      traceId: "trace-1",
      spanId: "span-1",
      name: "a",
      type: "llm",
      startTime: 100,
      endTime: 200,
      attributes: {},
    });
    void processor.onTraceEnd("trace-1");

    expect(processor.getTraces().get("trace-1")).toHaveLength(1);
  });

  it("should handle multiple traces independently", () => {
    const processor = memoryTraceProcessor();

    void processor.onTraceStart("trace-1");
    void processor.onTraceStart("trace-2");

    void processor.onSpan({
      traceId: "trace-1",
      spanId: "span-1",
      name: "span-a",
      type: "agent",
      startTime: 100,
      endTime: 200,
      attributes: {},
    });
    void processor.onSpan({
      traceId: "trace-2",
      spanId: "span-2",
      name: "span-b",
      type: "tool",
      startTime: 100,
      endTime: 200,
      attributes: {},
    });
    void processor.onSpan({
      traceId: "trace-2",
      spanId: "span-3",
      name: "span-c",
      type: "llm",
      startTime: 200,
      endTime: 300,
      attributes: {},
    });

    const traces = processor.getTraces();
    expect(traces.get("trace-1")).toHaveLength(1);
    expect(traces.get("trace-2")).toHaveLength(2);
  });
});
