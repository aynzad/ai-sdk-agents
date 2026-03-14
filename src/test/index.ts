import { vi } from "vitest";
import type { LanguageModel } from "ai";
import type { RunContext, GuardrailInput, TraceProcessor } from "../types";

export function createMockModel(): LanguageModel {
  return {
    specificationVersion: "v2",
    provider: "test",
    modelId: "test-model",
    defaultObjectGenerationMode: undefined,
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  } as unknown as LanguageModel;
}

export function makeGenerateTextResult(
  overrides: Record<string, unknown> = {},
) {
  const usage = {
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
  };
  return {
    text: "Hello!",
    steps: [
      {
        text: "Hello!",
        toolCalls: [],
        toolResults: [],
        finishReason: "stop" as const,
        usage,
      },
    ],
    toolCalls: [],
    toolResults: [],
    usage,
    totalUsage: usage,
    finishReason: "stop" as const,
    response: { id: "resp-1", model: "test-model", timestamp: new Date() },
    ...overrides,
  };
}

export interface StreamTextMockOverrides {
  textDeltas?: string[];
  fullStreamParts?: Array<Record<string, unknown>>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
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
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
  };
  const parts = overrides.fullStreamParts ?? [
    ...textDeltas.map((d) => ({ type: "text-delta" as const, text: d })),
    {
      type: "finish" as const,
      finishReason: overrides.finishReason ?? "stop",
      totalUsage: usage,
    },
  ];

  return {
    fullStream: iterate(parts),
    textStream: iterate(textDeltas),
    text: Promise.resolve(text),
    usage: Promise.resolve(usage),
    totalUsage: Promise.resolve(usage),
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
  input: Record<string, unknown>,
  output?: unknown,
) {
  const toolCallId = `call-${toolName}-${Date.now()}`;
  return {
    text: "",
    toolCalls: [{ toolCallId, toolName, input }],
    toolResults: output !== undefined ? [{ toolCallId, toolName, output }] : [],
    finishReason: "tool-calls" as const,
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  };
}

export function makeHandoffStep(handoffToolName: string) {
  const toolCallId = `call-${handoffToolName}-${Date.now()}`;
  return {
    text: "",
    toolCalls: [{ toolCallId, toolName: handoffToolName, input: {} }],
    toolResults: [],
    finishReason: "tool-calls" as const,
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
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
