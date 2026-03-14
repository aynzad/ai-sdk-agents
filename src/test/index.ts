import { vi } from "vitest";
import type { LanguageModelV1 } from "ai";
import type { RunContext, GuardrailInput, TraceProcessor } from "../types";

export function createMockModel(): LanguageModelV1 {
  return {
    specificationVersion: "v1",
    provider: "test",
    modelId: "test-model",
    defaultObjectGenerationMode: undefined,
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  };
}

export function makeGenerateTextResult(
  overrides: Record<string, unknown> = {},
) {
  return {
    text: "Hello!",
    steps: [
      {
        stepType: "initial" as const,
        text: "Hello!",
        toolCalls: [],
        toolResults: [],
        finishReason: "stop" as const,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
    ],
    toolCalls: [],
    toolResults: [],
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    finishReason: "stop" as const,
    response: { id: "resp-1", model: "test-model", timestamp: new Date() },
    ...overrides,
  };
}

export interface StreamTextMockOverrides {
  textDeltas?: string[];
  fullStreamParts?: Array<Record<string, unknown>>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  steps?: Array<Record<string, unknown>>;
  text?: string;
  finishReason?: string;
}

// eslint-disable-next-line @typescript-eslint/require-await
async function* iterate<T>(items: T[]): AsyncGenerator<T> {
  yield* items;
}

export function makeStreamTextResult(overrides: StreamTextMockOverrides = {}) {
  const textDeltas = overrides.textDeltas ?? ["Hello", "!"];
  const text = overrides.text ?? textDeltas.join("");
  const usage = overrides.usage ?? {
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
  };
  const parts = overrides.fullStreamParts ?? [
    ...textDeltas.map((d) => ({ type: "text-delta" as const, textDelta: d })),
    {
      type: "finish" as const,
      finishReason: overrides.finishReason ?? "stop",
      usage,
    },
  ];

  return {
    fullStream: iterate(parts),
    textStream: iterate(textDeltas),
    text: Promise.resolve(text),
    usage: Promise.resolve(usage),
    steps: Promise.resolve(overrides.steps ?? []),
    toolCalls: Promise.resolve([]),
    toolResults: Promise.resolve([]),
    finishReason: Promise.resolve(overrides.finishReason ?? "stop"),
    response: Promise.resolve({
      id: "resp-1",
      model: "test-model",
      timestamp: new Date(),
      messages: [],
    }),
  };
}

export function makeToolCallStep(
  toolName: string,
  args: Record<string, unknown>,
  result?: unknown,
) {
  const toolCallId = `call-${toolName}-${Date.now()}`;
  return {
    stepType: "initial" as const,
    text: "",
    toolCalls: [{ toolCallId, toolName, args }],
    toolResults: result !== undefined ? [{ toolCallId, toolName, result }] : [],
    finishReason: "tool-calls" as const,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  };
}

export function makeHandoffStep(handoffToolName: string) {
  const toolCallId = `call-${handoffToolName}-${Date.now()}`;
  return {
    stepType: "initial" as const,
    text: "",
    toolCalls: [{ toolCallId, toolName: handoffToolName, args: {} }],
    toolResults: [],
    finishReason: "tool-calls" as const,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  };
}

export function setupMockAI() {
  return {
    mockGenerateText: vi.fn(),
    mockStreamText: vi.fn(),
  };
}

export function createRunContext(
  overrides: Partial<RunContext<unknown>> = {},
): RunContext<unknown> {
  return {
    context: {},
    agent: "test-agent",
    traceId: "trace-123",
    turn: 1,
    ...overrides,
  };
}

export function createGuardrailInput(
  overrides: Partial<GuardrailInput> = {},
): GuardrailInput {
  return {
    messages: [{ role: "user", content: "Hello world" }],
    agentName: "test-agent",
    ...overrides,
  };
}

export function createMockProcessor(
  overrides: Partial<TraceProcessor> = {},
): TraceProcessor {
  return {
    onTraceStart: vi.fn(),
    onSpan: vi.fn(),
    onTraceEnd: vi.fn(),
    ...overrides,
  };
}
