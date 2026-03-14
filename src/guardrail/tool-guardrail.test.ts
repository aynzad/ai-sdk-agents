import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { ToolInputGuardrail, ToolOutputGuardrail } from "@/types";
import { ToolGuardrailTripwiredError } from "@/types";
import {
  ToolGuardrailBehaviorFactory,
  defineToolInputGuardrail,
  defineToolOutputGuardrail,
  guardedTool,
  isGuardedTool,
  getToolGuardrails,
  runToolInputGuardrails,
  runToolOutputGuardrails,
  wrapToolWithGuardrails,
} from "./tool-guardrail";
import { createRunContext } from "@/test";

const tick = () => new Promise<void>((r) => setTimeout(r, 1));

const ctx = createRunContext({ traceId: "trace-1" });

// ---------------------------------------------------------------------------
// Group 10: ToolGuardrailTripwiredError
// ---------------------------------------------------------------------------

describe("ToolGuardrailTripwiredError", () => {
  it("should set guardrailName, toolName, reason, and metadata", () => {
    const err = new ToolGuardrailTripwiredError(
      "block_secrets",
      "classify_text",
      "Secret found",
      { key: "value" },
    );
    expect(err.guardrailName).toBe("block_secrets");
    expect(err.toolName).toBe("classify_text");
    expect(err.reason).toBe("Secret found");
    expect(err.metadata).toEqual({ key: "value" });
  });

  it('should have name "ToolGuardrailTripwiredError"', () => {
    const err = new ToolGuardrailTripwiredError("g", "t");
    expect(err.name).toBe("ToolGuardrailTripwiredError");
  });

  it("should include guardrail and tool names in message", () => {
    const err = new ToolGuardrailTripwiredError(
      "block_secrets",
      "classify_text",
      "Secret found",
    );
    expect(err.message).toContain("block_secrets");
    expect(err.message).toContain("classify_text");
    expect(err.message).toContain("Secret found");
  });

  it("should work without reason and metadata", () => {
    const err = new ToolGuardrailTripwiredError("g", "t");
    expect(err.reason).toBeUndefined();
    expect(err.metadata).toBeUndefined();
    expect(err.message).toContain("g");
    expect(err.message).toContain("t");
  });
});

// ---------------------------------------------------------------------------
// Group 1: ToolGuardrailBehaviorFactory
// ---------------------------------------------------------------------------

describe("ToolGuardrailBehaviorFactory", () => {
  it("allow() should return { type: 'allow' }", () => {
    const result = ToolGuardrailBehaviorFactory.allow();
    expect(result).toEqual({ type: "allow" });
  });

  it("rejectContent(msg) should return correct shape", () => {
    const result = ToolGuardrailBehaviorFactory.rejectContent("blocked");
    expect(result).toEqual({ type: "rejectContent", message: "blocked" });
  });

  it("throwException() should return shape without reason", () => {
    const result = ToolGuardrailBehaviorFactory.throwException();
    expect(result).toEqual({ type: "throwException" });
    expect((result as { reason?: string }).reason).toBeUndefined();
  });

  it("throwException(reason) should include reason", () => {
    const result = ToolGuardrailBehaviorFactory.throwException("bad input");
    expect(result).toEqual({
      type: "throwException",
      reason: "bad input",
    });
  });

  it("throwException(reason, metadata) should include metadata", () => {
    const result = ToolGuardrailBehaviorFactory.throwException("bad", {
      key: "val",
    });
    expect(result).toEqual({
      type: "throwException",
      reason: "bad",
      metadata: { key: "val" },
    });
  });
});

// ---------------------------------------------------------------------------
// Group 2: defineToolInputGuardrail
// ---------------------------------------------------------------------------

describe("defineToolInputGuardrail", () => {
  it("should create a valid guardrail with name and execute", () => {
    const g = defineToolInputGuardrail({
      name: "test_guard",
      execute: () => Promise.resolve(ToolGuardrailBehaviorFactory.allow()),
    });
    expect(g.name).toBe("test_guard");
    expect(typeof g.execute).toBe("function");
  });

  it("should throw on empty name", () => {
    expect(() =>
      defineToolInputGuardrail({
        name: "",
        execute: () => Promise.resolve(ToolGuardrailBehaviorFactory.allow()),
      }),
    ).toThrow();
  });

  it("should throw on missing execute", () => {
    expect(() =>
      defineToolInputGuardrail({
        name: "test",
        execute: undefined as never,
      }),
    ).toThrow();
  });

  it("should preserve function reference", () => {
    const fn = () => Promise.resolve(ToolGuardrailBehaviorFactory.allow());
    const g = defineToolInputGuardrail({ name: "test", execute: fn });
    expect(g.execute).toBe(fn);
  });
});

// ---------------------------------------------------------------------------
// Group 3: defineToolOutputGuardrail
// ---------------------------------------------------------------------------

describe("defineToolOutputGuardrail", () => {
  it("should create a valid guardrail with name and execute", () => {
    const g = defineToolOutputGuardrail({
      name: "test_guard",
      execute: () => Promise.resolve(ToolGuardrailBehaviorFactory.allow()),
    });
    expect(g.name).toBe("test_guard");
    expect(typeof g.execute).toBe("function");
  });

  it("should throw on empty name", () => {
    expect(() =>
      defineToolOutputGuardrail({
        name: "",
        execute: () => Promise.resolve(ToolGuardrailBehaviorFactory.allow()),
      }),
    ).toThrow();
  });

  it("should throw on missing execute", () => {
    expect(() =>
      defineToolOutputGuardrail({
        name: "test",
        execute: undefined as never,
      }),
    ).toThrow();
  });

  it("should preserve function reference", () => {
    const fn = () => Promise.resolve(ToolGuardrailBehaviorFactory.allow());
    const g = defineToolOutputGuardrail({ name: "test", execute: fn });
    expect(g.execute).toBe(fn);
  });
});

// ---------------------------------------------------------------------------
// Group 4: guardedTool
// ---------------------------------------------------------------------------

describe("guardedTool", () => {
  const inputGuard = defineToolInputGuardrail({
    name: "ig",
    execute: () => Promise.resolve(ToolGuardrailBehaviorFactory.allow()),
  });
  const outputGuard = defineToolOutputGuardrail({
    name: "og",
    execute: () => Promise.resolve(ToolGuardrailBehaviorFactory.allow()),
  });

  it("should return a valid AI SDK Tool shape", () => {
    const t = guardedTool({
      description: "Test tool",
      inputSchema: z.object({ text: z.string() }),
      execute: async ({ text }) => {
        await tick();
        return text;
      },
      inputGuardrails: [inputGuard],
      outputGuardrails: [outputGuard],
    });
    expect(t.description).toBe("Test tool");
    expect(t.inputSchema).toBeDefined();
    expect(typeof t.execute).toBe("function");
  });

  it("should attach __toolGuardrails property", () => {
    const t = guardedTool({
      description: "Test",
      inputSchema: z.object({ x: z.number() }),
      execute: async ({ x }) => {
        await tick();
        return x;
      },
      inputGuardrails: [inputGuard],
      outputGuardrails: [outputGuard],
    });
    expect(t.__toolGuardrails).toBeDefined();
  });

  it("should store inputGuardrails", () => {
    const t = guardedTool({
      description: "Test",
      inputSchema: z.object({ x: z.number() }),
      execute: async ({ x }) => {
        await tick();
        return x;
      },
      inputGuardrails: [inputGuard],
      outputGuardrails: [outputGuard],
    });
    const guards = t.__toolGuardrails;
    expect(guards.inputGuardrails.length).toBe(1);
    expect(guards.inputGuardrails[0].name).toBe("ig");
  });

  it("should store outputGuardrails", () => {
    const t = guardedTool({
      description: "Test",
      inputSchema: z.object({ x: z.number() }),
      execute: async ({ x }) => {
        await tick();
        return x;
      },
      inputGuardrails: [inputGuard],
      outputGuardrails: [outputGuard],
    });
    const guards = t.__toolGuardrails;
    expect(guards.outputGuardrails.length).toBe(1);
    expect(guards.outputGuardrails[0].name).toBe("og");
  });

  it("should work with only inputGuardrails", () => {
    const t = guardedTool({
      description: "Test",
      inputSchema: z.object({ x: z.number() }),
      execute: async ({ x }) => {
        await tick();
        return x;
      },
      inputGuardrails: [inputGuard],
    });
    const guards = getToolGuardrails(t);
    expect(guards.inputGuardrails.length).toBe(1);
    expect(guards.outputGuardrails.length).toBe(0);
  });

  it("should work with only outputGuardrails", () => {
    const t = guardedTool({
      description: "Test",
      inputSchema: z.object({ x: z.number() }),
      execute: async ({ x }) => {
        await tick();
        return x;
      },
      outputGuardrails: [outputGuard],
    });
    const guards = getToolGuardrails(t);
    expect(guards.inputGuardrails.length).toBe(0);
    expect(guards.outputGuardrails.length).toBe(1);
  });

  it("should work with no guardrails", () => {
    const t = guardedTool({
      description: "Test",
      inputSchema: z.object({ x: z.number() }),
      execute: async ({ x }) => {
        await tick();
        return x;
      },
    });
    expect(isGuardedTool(t)).toBe(true);
    const guards = getToolGuardrails(t);
    expect(guards.inputGuardrails.length).toBe(0);
    expect(guards.outputGuardrails.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Group 5: isGuardedTool
// ---------------------------------------------------------------------------

describe("isGuardedTool", () => {
  it("should return true for guarded tool", () => {
    const t = guardedTool({
      description: "Test",
      inputSchema: z.object({ x: z.number() }),
      execute: async ({ x }) => {
        await tick();
        return x;
      },
      inputGuardrails: [
        defineToolInputGuardrail({
          name: "ig",
          execute: () => Promise.resolve(ToolGuardrailBehaviorFactory.allow()),
        }),
      ],
    });
    expect(isGuardedTool(t)).toBe(true);
  });

  it("should return false for plain AI SDK tool", () => {
    const plainTool = {
      description: "Plain",
      inputSchema: z.object({ x: z.number() }),
      execute: async ({ x }: { x: number }) => {
        await tick();
        return x;
      },
    };
    expect(isGuardedTool(plainTool)).toBe(false);
  });

  it("should return false for null/undefined", () => {
    expect(isGuardedTool(null)).toBe(false);
    expect(isGuardedTool(undefined)).toBe(false);
  });

  it("should return false for non-object", () => {
    expect(isGuardedTool("string")).toBe(false);
    expect(isGuardedTool(42)).toBe(false);
  });

  it("should return true with empty guardrail arrays", () => {
    const t = guardedTool({
      description: "Test",
      inputSchema: z.object({ x: z.number() }),
      execute: async ({ x }) => {
        await tick();
        return x;
      },
    });
    expect(isGuardedTool(t)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Group 6: getToolGuardrails
// ---------------------------------------------------------------------------

describe("getToolGuardrails", () => {
  it("should extract guardrails from guarded tool", () => {
    const ig = defineToolInputGuardrail({
      name: "ig",
      execute: () => Promise.resolve(ToolGuardrailBehaviorFactory.allow()),
    });
    const og = defineToolOutputGuardrail({
      name: "og",
      execute: () => Promise.resolve(ToolGuardrailBehaviorFactory.allow()),
    });
    const t = guardedTool({
      description: "Test",
      inputSchema: z.object({ x: z.number() }),
      execute: async ({ x }) => {
        await tick();
        return x;
      },
      inputGuardrails: [ig],
      outputGuardrails: [og],
    });
    const guards = getToolGuardrails(t);
    expect(guards.inputGuardrails).toHaveLength(1);
    expect(guards.inputGuardrails[0].name).toBe("ig");
    expect(guards.outputGuardrails).toHaveLength(1);
    expect(guards.outputGuardrails[0].name).toBe("og");
  });

  it("should return empty arrays for plain tool", () => {
    const plainTool = {
      description: "Plain",
      inputSchema: z.object({ x: z.number() }),
      execute: async ({ x }: { x: number }) => {
        await tick();
        return x;
      },
    };
    const guards = getToolGuardrails(plainTool);
    expect(guards.inputGuardrails).toHaveLength(0);
    expect(guards.outputGuardrails).toHaveLength(0);
  });

  it("should return empty arrays for null input", () => {
    const guards = getToolGuardrails(null);
    expect(guards.inputGuardrails).toHaveLength(0);
    expect(guards.outputGuardrails).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Group 7: runToolInputGuardrails
// ---------------------------------------------------------------------------

describe("runToolInputGuardrails", () => {
  const baseData = {
    toolName: "test_tool",
    toolCallId: "tc-1",
    input: { text: "hello" },
    ctx,
  };

  it("should return allow when all guardrails allow", async () => {
    const g1: ToolInputGuardrail = {
      name: "g1",
      execute: () => Promise.resolve(ToolGuardrailBehaviorFactory.allow()),
    };
    const g2: ToolInputGuardrail = {
      name: "g2",
      execute: () => Promise.resolve(ToolGuardrailBehaviorFactory.allow()),
    };
    const result = await runToolInputGuardrails([g1, g2], baseData);
    expect(result.type).toBe("allow");
  });

  it("should return rejectContent on first reject and skip remaining", async () => {
    const order: string[] = [];
    const g1: ToolInputGuardrail = {
      name: "g1",
      execute: async () => {
        await tick();
        order.push("g1");
        return ToolGuardrailBehaviorFactory.rejectContent("blocked");
      },
    };
    const g2: ToolInputGuardrail = {
      name: "g2",
      execute: async () => {
        await tick();
        order.push("g2");
        return ToolGuardrailBehaviorFactory.allow();
      },
    };
    const result = await runToolInputGuardrails([g1, g2], baseData);
    expect(result.type).toBe("rejectContent");
    if (result.type === "rejectContent") {
      expect(result.message).toBe("blocked");
    }
    expect(order).toEqual(["g1"]);
  });

  it("should return throwException on first throw and skip remaining", async () => {
    const order: string[] = [];
    const g1: ToolInputGuardrail = {
      name: "g1",
      execute: async () => {
        await tick();
        order.push("g1");
        return ToolGuardrailBehaviorFactory.throwException("fatal");
      },
    };
    const g2: ToolInputGuardrail = {
      name: "g2",
      execute: async () => {
        await tick();
        order.push("g2");
        return ToolGuardrailBehaviorFactory.allow();
      },
    };
    const result = await runToolInputGuardrails([g1, g2], baseData);
    expect(result.type).toBe("throwException");
    if (result.type === "throwException") {
      expect(result.reason).toBe("fatal");
    }
    expect(order).toEqual(["g1"]);
  });

  it("should run guardrails sequentially in order", async () => {
    const order: string[] = [];
    const g1: ToolInputGuardrail = {
      name: "g1",
      execute: async () => {
        await tick();
        order.push("g1");
        return ToolGuardrailBehaviorFactory.allow();
      },
    };
    const g2: ToolInputGuardrail = {
      name: "g2",
      execute: async () => {
        await tick();
        order.push("g2");
        return ToolGuardrailBehaviorFactory.allow();
      },
    };
    const g3: ToolInputGuardrail = {
      name: "g3",
      execute: async () => {
        await tick();
        order.push("g3");
        return ToolGuardrailBehaviorFactory.allow();
      },
    };
    await runToolInputGuardrails([g1, g2, g3], baseData);
    expect(order).toEqual(["g1", "g2", "g3"]);
  });

  it("should return allow for empty guardrails", async () => {
    const result = await runToolInputGuardrails([], baseData);
    expect(result.type).toBe("allow");
  });

  it("should return allow for single passing guardrail", async () => {
    const g: ToolInputGuardrail = {
      name: "g",
      execute: () => Promise.resolve(ToolGuardrailBehaviorFactory.allow()),
    };
    const result = await runToolInputGuardrails([g], baseData);
    expect(result.type).toBe("allow");
  });

  it("should pass correct data to guardrail execute", async () => {
    let receivedData: unknown;
    const g: ToolInputGuardrail = {
      name: "check",
      execute: async (data) => {
        await tick();
        receivedData = data;
        return ToolGuardrailBehaviorFactory.allow();
      },
    };
    await runToolInputGuardrails([g], baseData);
    expect(receivedData).toEqual(baseData);
  });

  it("should treat thrown error as throwException", async () => {
    const g: ToolInputGuardrail = {
      name: "throw_guard",
      execute: async () => {
        await tick();
        throw new Error("unexpected failure");
      },
    };
    const result = await runToolInputGuardrails([g], baseData);
    expect(result.type).toBe("throwException");
    if (result.type === "throwException") {
      expect(result.reason).toContain("throw_guard");
      expect(result.reason).toContain("unexpected failure");
    }
  });
});

// ---------------------------------------------------------------------------
// Group 8: runToolOutputGuardrails
// ---------------------------------------------------------------------------

describe("runToolOutputGuardrails", () => {
  const baseData = {
    toolName: "test_tool",
    toolCallId: "tc-1",
    input: { text: "hello" },
    output: "result-value",
    ctx,
  };

  it("should return allow when all guardrails allow", async () => {
    const g1: ToolOutputGuardrail = {
      name: "g1",
      execute: () => Promise.resolve(ToolGuardrailBehaviorFactory.allow()),
    };
    const g2: ToolOutputGuardrail = {
      name: "g2",
      execute: () => Promise.resolve(ToolGuardrailBehaviorFactory.allow()),
    };
    const result = await runToolOutputGuardrails([g1, g2], baseData);
    expect(result.type).toBe("allow");
  });

  it("should return rejectContent to replace output", async () => {
    const g: ToolOutputGuardrail = {
      name: "redact",
      execute: async () => {
        await tick();
        return ToolGuardrailBehaviorFactory.rejectContent("redacted");
      },
    };
    const result = await runToolOutputGuardrails([g], baseData);
    expect(result.type).toBe("rejectContent");
    if (result.type === "rejectContent") {
      expect(result.message).toBe("redacted");
    }
  });

  it("should return throwException and halt", async () => {
    const g: ToolOutputGuardrail = {
      name: "halt",
      execute: async () => {
        await tick();
        return ToolGuardrailBehaviorFactory.throwException("sensitive data");
      },
    };
    const result = await runToolOutputGuardrails([g], baseData);
    expect(result.type).toBe("throwException");
  });

  it("should receive output in data", async () => {
    let receivedOutput: unknown;
    const g: ToolOutputGuardrail = {
      name: "inspect",
      execute: async (data) => {
        await tick();
        receivedOutput = data.output;
        return ToolGuardrailBehaviorFactory.allow();
      },
    };
    await runToolOutputGuardrails([g], baseData);
    expect(receivedOutput).toBe("result-value");
  });

  it("should return allow for empty guardrails", async () => {
    const result = await runToolOutputGuardrails([], baseData);
    expect(result.type).toBe("allow");
  });

  it("should treat thrown error as throwException", async () => {
    const g: ToolOutputGuardrail = {
      name: "err_guard",
      execute: async () => {
        await tick();
        throw new Error("boom");
      },
    };
    const result = await runToolOutputGuardrails([g], baseData);
    expect(result.type).toBe("throwException");
    if (result.type === "throwException") {
      expect(result.reason).toContain("err_guard");
    }
  });
});

// ---------------------------------------------------------------------------
// Group 9: wrapToolWithGuardrails
// ---------------------------------------------------------------------------

describe("wrapToolWithGuardrails", () => {
  const schema = z.object({ text: z.string() });

  function makeGuardedToolForWrap(
    inputGuardrails: ToolInputGuardrail[] = [],
    outputGuardrails: ToolOutputGuardrail[] = [],
  ) {
    return guardedTool({
      description: "Wrap test tool",
      inputSchema: schema,
      execute: async ({ text }) => {
        await tick();
        return `result:${text}`;
      },
      inputGuardrails,
      outputGuardrails,
    });
  }

  it("should return a tool with same description and inputSchema", () => {
    const original = makeGuardedToolForWrap();
    const wrapped = wrapToolWithGuardrails("my_tool", original, ctx);
    expect(wrapped.description).toBe("Wrap test tool");
    expect(wrapped.inputSchema).toBe(original.inputSchema);
  });

  it("should run input guards -> original execute -> output guards in order", async () => {
    const order: string[] = [];
    const ig = defineToolInputGuardrail({
      name: "ig",
      execute: async () => {
        await tick();
        order.push("input_guard");
        return ToolGuardrailBehaviorFactory.allow();
      },
    });
    const og = defineToolOutputGuardrail({
      name: "og",
      execute: async () => {
        await tick();
        order.push("output_guard");
        return ToolGuardrailBehaviorFactory.allow();
      },
    });
    const t = guardedTool({
      description: "Order test",
      inputSchema: schema,
      execute: async ({ text }) => {
        await tick();
        order.push("execute");
        return `result:${text}`;
      },
      inputGuardrails: [ig],
      outputGuardrails: [og],
    });
    const wrapped = wrapToolWithGuardrails("order_tool", t, ctx);
    await wrapped.execute!(
      { text: "hi" },
      {
        toolCallId: "tc-1",
        messages: [],
        abortSignal: new AbortController().signal,
      },
    );
    expect(order).toEqual(["input_guard", "execute", "output_guard"]);
  });

  it("should skip original execute on input rejectContent", async () => {
    let executeCalled = false;
    const ig = defineToolInputGuardrail({
      name: "block",
      execute: async () => {
        await tick();
        return ToolGuardrailBehaviorFactory.rejectContent("not allowed");
      },
    });
    const t = guardedTool({
      description: "Reject test",
      inputSchema: schema,
      execute: async ({ text }) => {
        await tick();
        executeCalled = true;
        return `result:${text}`;
      },
      inputGuardrails: [ig],
    });
    const wrapped = wrapToolWithGuardrails("reject_tool", t, ctx);
    const result: unknown = await wrapped.execute!(
      { text: "hi" },
      {
        toolCallId: "tc-1",
        messages: [],
        abortSignal: new AbortController().signal,
      },
    );
    expect(result).toBe("not allowed");
    expect(executeCalled).toBe(false);
  });

  it("should throw ToolGuardrailTripwiredError on input throwException", async () => {
    const ig = defineToolInputGuardrail({
      name: "fatal_guard",
      execute: async () => {
        await tick();
        return ToolGuardrailBehaviorFactory.throwException("fatal reason", {
          severity: "high",
        });
      },
    });
    const t = guardedTool({
      description: "Throw test",
      inputSchema: schema,
      execute: async ({ text }) => {
        await tick();
        return `result:${text}`;
      },
      inputGuardrails: [ig],
    });
    const wrapped = wrapToolWithGuardrails("throw_tool", t, ctx);
    await expect(
      wrapped.execute!(
        { text: "hi" },
        {
          toolCallId: "tc-1",
          messages: [],
          abortSignal: new AbortController().signal,
        },
      ),
    ).rejects.toThrow(ToolGuardrailTripwiredError);

    try {
      await wrapped.execute!(
        { text: "hi" },
        {
          toolCallId: "tc-1",
          messages: [],
          abortSignal: new AbortController().signal,
        },
      );
    } catch (err) {
      const e = err as ToolGuardrailTripwiredError;
      expect(e.guardrailName).toBe("fatal_guard");
      expect(e.toolName).toBe("throw_tool");
      expect(e.reason).toBe("fatal reason");
      expect(e.metadata).toEqual({ severity: "high" });
    }
  });

  it("should replace result on output rejectContent", async () => {
    const og = defineToolOutputGuardrail({
      name: "redact",
      execute: async () => {
        await tick();
        return ToolGuardrailBehaviorFactory.rejectContent("redacted output");
      },
    });
    const t = guardedTool({
      description: "Redact test",
      inputSchema: schema,
      execute: async ({ text }) => {
        await tick();
        return `secret:${text}`;
      },
      outputGuardrails: [og],
    });
    const wrapped = wrapToolWithGuardrails("redact_tool", t, ctx);
    const result: unknown = await wrapped.execute!(
      { text: "hi" },
      {
        toolCallId: "tc-1",
        messages: [],
        abortSignal: new AbortController().signal,
      },
    );
    expect(result).toBe("redacted output");
  });

  it("should throw ToolGuardrailTripwiredError on output throwException after execute ran", async () => {
    let executeCalled = false;
    const og = defineToolOutputGuardrail({
      name: "output_fatal",
      execute: async () => {
        await tick();
        return ToolGuardrailBehaviorFactory.throwException("output bad");
      },
    });
    const t = guardedTool({
      description: "Output throw test",
      inputSchema: schema,
      execute: async ({ text }) => {
        await tick();
        executeCalled = true;
        return `result:${text}`;
      },
      outputGuardrails: [og],
    });
    const wrapped = wrapToolWithGuardrails("output_throw_tool", t, ctx);
    await expect(
      wrapped.execute!(
        { text: "hi" },
        {
          toolCallId: "tc-1",
          messages: [],
          abortSignal: new AbortController().signal,
        },
      ),
    ).rejects.toThrow(ToolGuardrailTripwiredError);
    expect(executeCalled).toBe(true);
  });

  it("should return original result when all guardrails allow", async () => {
    const ig = defineToolInputGuardrail({
      name: "pass_ig",
      execute: () => Promise.resolve(ToolGuardrailBehaviorFactory.allow()),
    });
    const og = defineToolOutputGuardrail({
      name: "pass_og",
      execute: () => Promise.resolve(ToolGuardrailBehaviorFactory.allow()),
    });
    const t = guardedTool({
      description: "Pass test",
      inputSchema: schema,
      execute: async ({ text }) => {
        await tick();
        return `result:${text}`;
      },
      inputGuardrails: [ig],
      outputGuardrails: [og],
    });
    const wrapped = wrapToolWithGuardrails("pass_tool", t, ctx);
    const result: unknown = await wrapped.execute!(
      { text: "world" },
      {
        toolCallId: "tc-1",
        messages: [],
        abortSignal: new AbortController().signal,
      },
    );
    expect(result).toBe("result:world");
  });

  it("should pass through when no guardrails attached", async () => {
    const t = guardedTool({
      description: "No guards",
      inputSchema: schema,
      execute: async ({ text }) => {
        await tick();
        return `plain:${text}`;
      },
    });
    const wrapped = wrapToolWithGuardrails("plain_tool", t, ctx);
    const result: unknown = await wrapped.execute!(
      { text: "abc" },
      {
        toolCallId: "tc-1",
        messages: [],
        abortSignal: new AbortController().signal,
      },
    );
    expect(result).toBe("plain:abc");
  });

  it("should pass toolCallId from options to guardrail data", async () => {
    let receivedCallId: string | undefined;
    const ig = defineToolInputGuardrail({
      name: "check_id",
      execute: async (data) => {
        await tick();
        receivedCallId = data.toolCallId;
        return ToolGuardrailBehaviorFactory.allow();
      },
    });
    const t = guardedTool({
      description: "ID test",
      inputSchema: schema,
      execute: async ({ text }) => {
        await tick();
        return text;
      },
      inputGuardrails: [ig],
    });
    const wrapped = wrapToolWithGuardrails("id_tool", t, ctx);
    await wrapped.execute!(
      { text: "hi" },
      {
        toolCallId: "call-42",
        messages: [],
        abortSignal: new AbortController().signal,
      },
    );
    expect(receivedCallId).toBe("call-42");
  });
});
