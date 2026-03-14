import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  guardedTool,
  defineToolInputGuardrail,
  defineToolOutputGuardrail,
  ToolGuardrailBehaviorFactory,
  isGuardedTool,
} from "ai-sdk-agents";
import { createRunContext } from "ai-sdk-agents/test";
import { tool } from "ai";

const noSqlInjection = defineToolInputGuardrail({
  name: "no-sql-injection",
  execute: (data) => {
    const input = JSON.stringify(data.input);
    const suspicious = /('|--|;|DROP|DELETE|INSERT)/i.test(input);
    return Promise.resolve(
      suspicious
        ? ToolGuardrailBehaviorFactory.throwException(
            "SQL injection attempt blocked",
          )
        : ToolGuardrailBehaviorFactory.allow(),
    );
  },
});

const noPII = defineToolOutputGuardrail({
  name: "no-pii",
  execute: (data) => {
    const output = JSON.stringify(data.output);
    const hasPII = /\d{3}-\d{2}-\d{4}/.test(output);
    return Promise.resolve(
      hasPII
        ? ToolGuardrailBehaviorFactory.rejectContent(
            "PII detected in tool output",
          )
        : ToolGuardrailBehaviorFactory.allow(),
    );
  },
});

const dbQuery = guardedTool({
  description: "Query the database",
  inputSchema: z.object({ query: z.string() }),
  execute: ({ query }) =>
    Promise.resolve({ results: [`Result for: ${query}`] }),
  inputGuardrails: [noSqlInjection],
  outputGuardrails: [noPII],
});

const ctx = createRunContext({ traceId: "test-trace" });

const guardrailData = {
  toolName: "dbQuery",
  toolCallId: "tc-1",
  input: {},
  ctx,
};

describe("tool-guardrails", () => {
  it("isGuardedTool should detect guarded tools", () => {
    expect(isGuardedTool(dbQuery)).toBe(true);

    const plainTool = tool({
      description: "Plain tool",
      inputSchema: z.object({ x: z.string() }),
      execute: ({ x }) => Promise.resolve(x),
    });
    expect(isGuardedTool(plainTool)).toBe(false);
  });

  it("input guardrail should allow safe queries", async () => {
    const result = await noSqlInjection.execute({
      ...guardrailData,
      input: { query: "SELECT name FROM users" },
    });
    expect(result.type).toBe("allow");
  });

  it("input guardrail should block SQL injection", async () => {
    const result = await noSqlInjection.execute({
      ...guardrailData,
      input: { query: "'; DROP TABLE users; --" },
    });
    expect(result.type).toBe("throwException");
  });

  it("output guardrail should allow safe output", async () => {
    const result = await noPII.execute({
      ...guardrailData,
      output: { results: ["John Doe, active"] },
    });
    expect(result.type).toBe("allow");
  });

  it("output guardrail should reject PII in output", async () => {
    const result = await noPII.execute({
      ...guardrailData,
      output: { results: ["SSN: 123-45-6789"] },
    });
    expect(result.type).toBe("rejectContent");
  });
});
