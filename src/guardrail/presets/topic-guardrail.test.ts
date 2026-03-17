import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LanguageModel } from "ai";
import { topicGuardrail } from "./topic-guardrail";
import { createRunContext, createGuardrailInput } from "ai-sdk-agents/test";

import type * as AiModule from "ai";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof AiModule>();
  return { ...actual, generateText: vi.fn() };
});

describe("topicGuardrail", () => {
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

  it("should have the name 'topic_guardrail'", () => {
    const guard = topicGuardrail({
      model: mockModel,
      allowedTopics: "Customer support for a SaaS product",
    });
    expect(guard.name).toBe("topic_guardrail");
  });

  it("should support custom name", () => {
    const guard = topicGuardrail({
      model: mockModel,
      allowedTopics: "Cooking",
      name: "my-topic",
    });
    expect(guard.name).toBe("my-topic");
  });

  it("should not trip when LLM responds with NO (on-topic)", async () => {
    mockGenerateText.mockResolvedValue({ text: "NO" });
    const guard = topicGuardrail({
      model: mockModel,
      allowedTopics: "Cooking and recipes",
    });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "How do I make pasta?" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(false);
  });

  it("should trip when LLM responds with YES (off-topic)", async () => {
    mockGenerateText.mockResolvedValue({ text: "YES" });
    const guard = topicGuardrail({
      model: mockModel,
      allowedTopics: "Cooking and recipes",
    });
    const input = createGuardrailInput({
      messages: [{ role: "user", content: "What stocks should I buy?" }],
    });
    const result = await guard.execute(ctx, input);
    expect(result.tripwired).toBe(true);
  });

  it("should include the allowed topics description in the prompt", async () => {
    mockGenerateText.mockResolvedValue({ text: "NO" });
    const guard = topicGuardrail({
      model: mockModel,
      allowedTopics: "Customer support for Acme Corp",
    });
    await guard.execute(ctx, createGuardrailInput());
    const callArgs = mockGenerateText.mock.calls[0][0] as { prompt: string };
    expect(callArgs.prompt).toContain("Customer support for Acme Corp");
  });

  it("should include message text in the prompt", async () => {
    mockGenerateText.mockResolvedValue({ text: "NO" });
    const guard = topicGuardrail({
      model: mockModel,
      allowedTopics: "General",
    });
    await guard.execute(
      ctx,
      createGuardrailInput({
        messages: [{ role: "user", content: "My question here" }],
      }),
    );
    const callArgs = mockGenerateText.mock.calls[0][0] as { prompt: string };
    expect(callArgs.prompt).toContain("My question here");
  });

  it("should trip on LLM failure (safety-first)", async () => {
    mockGenerateText.mockRejectedValue(new Error("API error"));
    const guard = topicGuardrail({
      model: mockModel,
      allowedTopics: "General",
    });
    const result = await guard.execute(ctx, createGuardrailInput());
    expect(result.tripwired).toBe(true);
  });
});
