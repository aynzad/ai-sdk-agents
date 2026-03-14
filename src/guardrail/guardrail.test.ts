import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LanguageModel, ModelMessage } from "ai";
import type * as AiModule from "ai";
import type { Guardrail } from "@/types";
import {
  guardrail,
  llmGuardrail,
  runGuardrails,
  keywordGuardrail,
  maxLengthGuardrail,
  regexGuardrail,
} from "./guardrail";
import { createRunContext, createGuardrailInput } from "@/test";

const ctx = createRunContext();

// ---------------------------------------------------------------------------
// guardrail() factory
// ---------------------------------------------------------------------------

describe("guardrail", () => {
  it("should create a valid Guardrail with name and execute", () => {
    const g = guardrail({
      name: "test-guard",
      execute: () => Promise.resolve({ tripwired: false }),
    });

    expect(g.name).toBe("test-guard");
    expect(typeof g.execute).toBe("function");
  });

  it("should throw when name is empty string", () => {
    expect(() =>
      guardrail({
        name: "",
        execute: () => Promise.resolve({ tripwired: false }),
      }),
    ).toThrow();
  });

  it("should throw when name is undefined", () => {
    expect(() =>
      guardrail({
        name: undefined as unknown as string,
        execute: () => Promise.resolve({ tripwired: false }),
      }),
    ).toThrow();
  });

  it("should throw when execute is not a function", () => {
    expect(() =>
      guardrail({
        name: "bad-guard",
        execute: "not-a-function" as unknown as Guardrail["execute"],
      }),
    ).toThrow();
  });

  it("should throw when execute is undefined", () => {
    expect(() =>
      guardrail({
        name: "bad-guard",
        execute: undefined as unknown as Guardrail["execute"],
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// keywordGuardrail
// ---------------------------------------------------------------------------

describe("keywordGuardrail", () => {
  it("should trip on blocked keyword (case-insensitive by default)", async () => {
    const g = keywordGuardrail({ blockedKeywords: ["bomb"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "How to build a BOMB" }],
    });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(true);
    expect(result.reason).toBeDefined();
  });

  it("should not trip when no keywords match", async () => {
    const g = keywordGuardrail({ blockedKeywords: ["bomb", "weapon"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "How to bake a cake" }],
    });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(false);
  });

  it("should respect caseSensitive: true", async () => {
    const g = keywordGuardrail({
      blockedKeywords: ["SECRET"],
      caseSensitive: true,
    });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "This is a secret message" }],
    });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(false);
  });

  it("should trip with caseSensitive: true when case matches", async () => {
    const g = keywordGuardrail({
      blockedKeywords: ["SECRET"],
      caseSensitive: true,
    });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "This is a SECRET message" }],
    });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(true);
  });

  it("should trip when any of multiple blocked keywords match", async () => {
    const g = keywordGuardrail({
      blockedKeywords: ["bomb", "weapon", "hack"],
    });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "How to hack a computer" }],
    });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(true);
  });

  it("should not trip on empty messages", async () => {
    const g = keywordGuardrail({ blockedKeywords: ["bomb"] });
    const input = createGuardrailInput({ messages: [] });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(false);
  });

  it("should include the matched keyword in reason", async () => {
    const g = keywordGuardrail({ blockedKeywords: ["forbidden"] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "This is forbidden content" }],
    });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(true);
    expect(result.reason).toContain("forbidden");
  });

  it("should not trip with empty blockedKeywords array", async () => {
    const g = keywordGuardrail({ blockedKeywords: [] });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "anything goes" }],
    });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(false);
  });

  it("should scan ContentPart array messages for keywords", async () => {
    const g = keywordGuardrail({ blockedKeywords: ["secret"] });
    const input = createGuardrailInput({
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "This contains a secret phrase" }],
        },
      ],
    });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(true);
  });

  it("should skip non-text content parts", async () => {
    const g = keywordGuardrail({ blockedKeywords: ["secret"] });
    const input = createGuardrailInput({
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "tc1",
              toolName: "search",
              input: { q: "secret" },
            },
          ],
        } as ModelMessage,
      ],
    });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(false);
  });

  it("should have a descriptive name", () => {
    const g = keywordGuardrail({ blockedKeywords: ["test"] });

    expect(g.name).toBeTruthy();
    expect(typeof g.name).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// maxLengthGuardrail
// ---------------------------------------------------------------------------

describe("maxLengthGuardrail", () => {
  it("should trip when message exceeds maxLength", async () => {
    const g = maxLengthGuardrail({ maxLength: 10 });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "This message is way too long" }],
    });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(true);
    expect(result.reason).toBeDefined();
  });

  it("should not trip when message is under limit", async () => {
    const g = maxLengthGuardrail({ maxLength: 100 });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Short msg" }],
    });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(false);
  });

  it("should not trip when message length is exactly at limit", async () => {
    const content = "abcde";
    const g = maxLengthGuardrail({ maxLength: content.length });
    const input = createGuardrailInput({
      messages: [{ role: "user", content }],
    });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(false);
  });

  it("should not trip on empty messages", async () => {
    const g = maxLengthGuardrail({ maxLength: 10 });
    const input = createGuardrailInput({ messages: [] });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(false);
  });

  it("should trip when maxLength is zero and messages have content", async () => {
    const g = maxLengthGuardrail({ maxLength: 0 });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "a" }],
    });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(true);
  });

  it("should have a descriptive name", () => {
    const g = maxLengthGuardrail({ maxLength: 50 });

    expect(g.name).toBeTruthy();
    expect(typeof g.name).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// regexGuardrail
// ---------------------------------------------------------------------------

describe("regexGuardrail", () => {
  it("should trip when pattern matches", async () => {
    const g = regexGuardrail({ pattern: /\bpassword\b/i });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "My password is 12345" }],
    });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(true);
  });

  it("should not trip when pattern does not match", async () => {
    const g = regexGuardrail({ pattern: /\bpassword\b/i });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Hello world" }],
    });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(false);
  });

  it("should use custom reason when provided", async () => {
    const g = regexGuardrail({
      pattern: /\d{3}-\d{2}-\d{4}/,
      reason: "SSN detected",
    });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "My SSN is 123-45-6789" }],
    });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(true);
    expect(result.reason).toBe("SSN detected");
  });

  it("should use default reason mentioning pattern when reason omitted", async () => {
    const pattern = /credit.?card/i;
    const g = regexGuardrail({ pattern });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "Here is my credit card number" }],
    });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(true);
    expect(result.reason).toBeDefined();
    expect(result.reason!.length).toBeGreaterThan(0);
  });

  it("should not trip on empty messages", async () => {
    const g = regexGuardrail({ pattern: /secret/ });
    const input = createGuardrailInput({ messages: [] });

    const result = await g.execute(ctx, input);

    expect(result.tripwired).toBe(false);
  });

  it("should have a descriptive name", () => {
    const g = regexGuardrail({ pattern: /test/ });

    expect(g.name).toBeTruthy();
    expect(typeof g.name).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// llmGuardrail
// ---------------------------------------------------------------------------

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof AiModule>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

describe("llmGuardrail", () => {
  let mockGenerateText: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const aiModule = await import("ai");
    mockGenerateText = aiModule.generateText as ReturnType<typeof vi.fn>;
    mockGenerateText.mockReset();
  });

  const mockModel = {
    specificationVersion: "v2" as const,
    provider: "test",
    modelId: "test-model",
    defaultObjectGenerationMode: undefined,
    supportedUrls: {},
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  } as unknown as LanguageModel;

  it("should call generateText with the model and built prompt", async () => {
    mockGenerateText.mockResolvedValue({ text: "safe" });

    const g = llmGuardrail({
      name: "llm-safety",
      model: mockModel,
      promptBuilder: (_ctx, _input) => "Is this safe?",
      tripWhen: () => false,
    });

    await g.execute(ctx, createGuardrailInput());

    expect(mockGenerateText).toHaveBeenCalledOnce();
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: mockModel,
        prompt: "Is this safe?",
      }),
    );
  });

  it("should trip when tripWhen predicate returns true", async () => {
    mockGenerateText.mockResolvedValue({ text: "UNSAFE" });

    const g = llmGuardrail({
      name: "llm-safety",
      model: mockModel,
      promptBuilder: () => "Check this",
      tripWhen: (text) => text.includes("UNSAFE"),
    });

    const result = await g.execute(ctx, createGuardrailInput());

    expect(result.tripwired).toBe(true);
  });

  it("should not trip when tripWhen predicate returns false", async () => {
    mockGenerateText.mockResolvedValue({ text: "SAFE" });

    const g = llmGuardrail({
      name: "llm-safety",
      model: mockModel,
      promptBuilder: () => "Check this",
      tripWhen: (text) => text.includes("UNSAFE"),
    });

    const result = await g.execute(ctx, createGuardrailInput());

    expect(result.tripwired).toBe(false);
  });

  it("should pass context and input to promptBuilder", async () => {
    mockGenerateText.mockResolvedValue({ text: "ok" });
    const promptBuilder = vi.fn().mockReturnValue("prompt");

    const g = llmGuardrail({
      name: "llm-safety",
      model: mockModel,
      promptBuilder,
      tripWhen: () => false,
    });

    const customCtx = createRunContext({ agent: "custom-agent" });
    const customInput = createGuardrailInput({ agentName: "custom-agent" });

    await g.execute(customCtx, customInput);

    expect(promptBuilder).toHaveBeenCalledWith(customCtx, customInput);
  });

  it("should treat generateText errors as tripwires (safety-first)", async () => {
    mockGenerateText.mockRejectedValue(new Error("API failure"));

    const g = llmGuardrail({
      name: "llm-safety",
      model: mockModel,
      promptBuilder: () => "Check this",
      tripWhen: () => false,
    });

    const result = await g.execute(ctx, createGuardrailInput());

    expect(result.tripwired).toBe(true);
    expect(result.reason).toBeDefined();
  });

  it("should have the provided name", () => {
    const g = llmGuardrail({
      name: "content-filter",
      model: mockModel,
      promptBuilder: () => "prompt",
      tripWhen: () => false,
    });

    expect(g.name).toBe("content-filter");
  });
});

// ---------------------------------------------------------------------------
// runGuardrails
// ---------------------------------------------------------------------------

describe("runGuardrails", () => {
  it("should return { tripwired: false } when all guardrails pass", async () => {
    const g1 = guardrail({
      name: "pass-1",
      execute: () => Promise.resolve({ tripwired: false }),
    });
    const g2 = guardrail({
      name: "pass-2",
      execute: () => Promise.resolve({ tripwired: false }),
    });

    const result = await runGuardrails([g1, g2], ctx, createGuardrailInput());

    expect(result.tripwired).toBe(false);
  });

  it("should return tripwired result with guardrailName when one trips", async () => {
    const g1 = guardrail({
      name: "pass-guard",
      execute: () => Promise.resolve({ tripwired: false }),
    });
    const g2 = guardrail({
      name: "trip-guard",
      execute: () => Promise.resolve({ tripwired: true, reason: "blocked" }),
    });

    const result = await runGuardrails([g1, g2], ctx, createGuardrailInput());

    expect(result.tripwired).toBe(true);
    expect(result.guardrailName).toBe("trip-guard");
    expect(result.reason).toBe("blocked");
  });

  it("should run guardrails in parallel (timing test)", async () => {
    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    const g1 = guardrail({
      name: "slow-1",
      execute: async () => {
        await delay(50);
        return { tripwired: false };
      },
    });
    const g2 = guardrail({
      name: "slow-2",
      execute: async () => {
        await delay(50);
        return { tripwired: false };
      },
    });

    const start = Date.now();
    await runGuardrails([g1, g2], ctx, createGuardrailInput());
    const elapsed = Date.now() - start;

    // If run sequentially, would take >= 100ms. Parallel should be < 100ms.
    expect(elapsed).toBeLessThan(100);
  });

  it("should treat thrown errors as tripwires with guardrailName", async () => {
    const g1 = guardrail({
      name: "error-guard",
      execute: () => Promise.reject(new Error("execute blew up")),
    });

    const result = await runGuardrails([g1], ctx, createGuardrailInput());

    expect(result.tripwired).toBe(true);
    expect(result.guardrailName).toBe("error-guard");
    expect(result.reason).toBeDefined();
  });

  it("should return { tripwired: false } for empty guardrails array", async () => {
    const result = await runGuardrails([], ctx, createGuardrailInput());

    expect(result.tripwired).toBe(false);
  });

  it("should handle single guardrail that passes", async () => {
    const g = guardrail({
      name: "single-pass",
      execute: () => Promise.resolve({ tripwired: false }),
    });

    const result = await runGuardrails([g], ctx, createGuardrailInput());

    expect(result.tripwired).toBe(false);
  });

  it("should handle single guardrail that trips", async () => {
    const g = guardrail({
      name: "single-trip",
      execute: () => Promise.resolve({ tripwired: true, reason: "nope" }),
    });

    const result = await runGuardrails([g], ctx, createGuardrailInput());

    expect(result.tripwired).toBe(true);
    expect(result.guardrailName).toBe("single-trip");
  });

  it("should return metadata from the tripwired guardrail", async () => {
    const g = guardrail({
      name: "meta-guard",
      execute: () =>
        Promise.resolve({
          tripwired: true,
          reason: "bad",
          metadata: { severity: "high", category: "safety" },
        }),
    });

    const result = await runGuardrails([g], ctx, createGuardrailInput());

    expect(result.tripwired).toBe(true);
    expect(result.metadata).toEqual({ severity: "high", category: "safety" });
  });

  it("should handle mixed pass/fail/error guardrails", async () => {
    const gPass = guardrail({
      name: "passer",
      execute: () => Promise.resolve({ tripwired: false }),
    });
    const gTrip = guardrail({
      name: "tripper",
      execute: () => Promise.resolve({ tripwired: true, reason: "tripped" }),
    });
    const gError = guardrail({
      name: "thrower",
      execute: () => Promise.reject(new Error("boom")),
    });

    const result = await runGuardrails(
      [gPass, gTrip, gError],
      ctx,
      createGuardrailInput(),
    );

    expect(result.tripwired).toBe(true);
    expect(result.guardrailName).toBeDefined();
  });
});
