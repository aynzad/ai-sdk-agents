import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LanguageModel } from "ai";
import { nsfwGuardrail } from "./nsfw-guardrail";
import { createRunContext, createGuardrailInput } from "ai-sdk-agents/test";

import type * as AiModule from "ai";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof AiModule>();
  return { ...actual, generateText: vi.fn() };
});

describe("nsfwGuardrail", () => {
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

  it("should have the name 'nsfw_guardrail'", () => {
    const guard = nsfwGuardrail({ model: mockModel });
    expect(guard.name).toBe("nsfw_guardrail");
  });

  it("should support custom name", () => {
    const guard = nsfwGuardrail({ model: mockModel, name: "my-nsfw" });
    expect(guard.name).toBe("my-nsfw");
  });

  it("should not trip when LLM responds with NO", async () => {
    mockGenerateText.mockResolvedValue({ text: "NO" });
    const guard = nsfwGuardrail({ model: mockModel });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "How do I bake a cake?" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  it("should trip when LLM responds with YES", async () => {
    mockGenerateText.mockResolvedValue({ text: "YES" });
    const guard = nsfwGuardrail({ model: mockModel });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "explicit content" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  it("should include message text in the prompt", async () => {
    mockGenerateText.mockResolvedValue({ text: "NO" });
    const guard = nsfwGuardrail({ model: mockModel });
    await guard.execute(
      ctx,
      createGuardrailInput({
        messages: [{ role: "user", content: "Some text here" }],
      }),
    );
    const callArgs = mockGenerateText.mock.calls[0][0] as { prompt: string };
    expect(callArgs.prompt).toContain("Some text here");
  });

  it("should trip on LLM failure (safety-first)", async () => {
    mockGenerateText.mockRejectedValue(new Error("API error"));
    const guard = nsfwGuardrail({ model: mockModel });
    const result = await guard.execute(ctx, createGuardrailInput());
    expect(result.tripwired).toBe(true);
  });
});
