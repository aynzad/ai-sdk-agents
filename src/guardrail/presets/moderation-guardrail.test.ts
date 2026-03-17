import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LanguageModel } from "ai";
import { moderationGuardrail } from "./moderation-guardrail";
import { createRunContext, createGuardrailInput } from "ai-sdk-agents/test";

import type * as AiModule from "ai";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof AiModule>();
  return { ...actual, generateText: vi.fn() };
});

describe("moderationGuardrail", () => {
  let mockGenerateText: ReturnType<typeof vi.fn>;
  const ctx = createRunContext();

  const mockModel = {
    specificationVersion: "v2" as const,
    provider: "test",
    modelId: "test-model",
    defaultObjectGenerationMode: undefined,
    supportedUrls: {},
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  } as unknown as LanguageModel;

  beforeEach(async () => {
    const aiModule = await import("ai");
    mockGenerateText = aiModule.generateText as unknown as ReturnType<
      typeof vi.fn
    >;
    mockGenerateText.mockReset();
  });

  it("should have the name 'moderation_guardrail'", () => {
    const guard = moderationGuardrail({ model: mockModel });
    expect(guard.name).toBe("moderation_guardrail");
  });

  it("should support custom name", () => {
    const guard = moderationGuardrail({ model: mockModel, name: "my-mod" });
    expect(guard.name).toBe("my-mod");
  });

  it("should not trip when LLM responds with NO", async () => {
    mockGenerateText.mockResolvedValue({ text: "NO" });
    const guard = moderationGuardrail({ model: mockModel });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "How are you today?" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  it("should trip when LLM responds with YES", async () => {
    mockGenerateText.mockResolvedValue({ text: "YES" });
    const guard = moderationGuardrail({ model: mockModel });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "violent content here" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  it("should include message text in the prompt", async () => {
    mockGenerateText.mockResolvedValue({ text: "NO" });
    const guard = moderationGuardrail({ model: mockModel });
    await guard.execute(
      ctx,
      createGuardrailInput({
        messages: [{ role: "user", content: "Hello friend" }],
      }),
    );
    const callArgs = mockGenerateText.mock.calls[0][0] as { prompt: string };
    expect(callArgs.prompt).toContain("Hello friend");
  });

  it("should include specified categories in the prompt", async () => {
    mockGenerateText.mockResolvedValue({ text: "NO" });
    const guard = moderationGuardrail({
      model: mockModel,
      categories: ["hate", "violence"],
    });
    await guard.execute(ctx, createGuardrailInput());
    const callArgs = mockGenerateText.mock.calls[0][0] as { prompt: string };
    expect(callArgs.prompt).toContain("hate");
  });

  it("should trip on LLM failure (safety-first)", async () => {
    mockGenerateText.mockRejectedValue(new Error("API error"));
    const guard = moderationGuardrail({ model: mockModel });
    const result = await guard.execute(ctx, createGuardrailInput());
    expect(result.tripwired).toBe(true);
  });
});
