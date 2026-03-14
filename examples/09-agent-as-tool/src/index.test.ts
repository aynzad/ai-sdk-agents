import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent, Runner } from "ai-sdk-agents";
import {
  createMockModel,
  makeGenerateTextResult,
  makeToolCallStep,
} from "ai-sdk-agents/test";

const { mockGenerateText } = vi.hoisted(() => {
  return { mockGenerateText: vi.fn() };
});

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type AiModule = typeof import("ai");

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<AiModule>();
  return { ...actual, generateText: mockGenerateText };
});

function createTranslator() {
  return new Agent({
    name: "Translator",
    instructions:
      "You are a translator. Translate the given text to French. Respond with only the translation.",
    model: createMockModel(),
  });
}

function createOrchestrator(translator: Agent) {
  return new Agent({
    name: "Orchestrator",
    instructions:
      "You are a helpful assistant. When asked to translate something, use the translator tool.",
    model: createMockModel(),
    tools: {
      translate: translator.asTool({
        toolName: "translate",
        toolDescription: "Translate text to French",
      }),
    },
  });
}

describe("agent-as-tool", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("asTool should create a tool from an agent", () => {
    const translator = createTranslator();
    const tool = translator.asTool();

    expect(tool).toHaveProperty("execute");
    expect(tool).toHaveProperty("description");
    expect(tool).toHaveProperty("inputSchema");
    expect(typeof tool.execute).toBe("function");
  });

  it("should call the translator agent via tool", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResult({
        text: "The French translation is: Bonjour le monde",
        steps: [
          makeToolCallStep(
            "translate",
            { message: "Hello world" },
            "Bonjour le monde",
          ),
          {
            text: "The French translation is: Bonjour le monde",
            toolCalls: [],
            toolResults: [],
            finishReason: "stop" as const,
            usage: { inputTokens: 20, outputTokens: 15, totalTokens: 35 },
          },
        ],
      }),
    );

    const translator = createTranslator();
    const orchestrator = createOrchestrator(translator);
    const result = await Runner.run(
      orchestrator,
      "Translate 'Hello world' to French",
    );

    expect(result.output).toContain("Bonjour");
  });

  it("should pass toolName and toolDescription options", () => {
    const translator = createTranslator();

    const toolWithDefaults = translator.asTool();
    expect(toolWithDefaults.description).toContain("Translator");

    const toolWithOptions = translator.asTool({
      toolName: "translate",
      toolDescription: "Translate text to French",
    });
    expect(toolWithOptions.description).toBe("Translate text to French");
  });
});
