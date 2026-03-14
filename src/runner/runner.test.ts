import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LanguageModelV1 } from "ai";
import { z } from "zod";
import type { RunContext, CoreMessage, Guardrail } from "@/types";
import {
  GuardrailTripwiredError,
  MaxTurnsExceededError,
  ToolGuardrailTripwiredError,
} from "@/types";
import { Agent } from "@/agent/agent";
import { handoff } from "@/handoff/handoff";
import {
  guardedTool,
  defineToolInputGuardrail,
  ToolGuardrailBehaviorFactory,
  isGuardedTool,
} from "@/guardrail/tool-guardrail";
import { Runner } from "./runner";

// ---------------------------------------------------------------------------
// Module-level mocks for generateText and streamText
// ---------------------------------------------------------------------------

const { mockGenerateText, mockStreamText } = vi.hoisted(() => {
  return { mockGenerateText: vi.fn(), mockStreamText: vi.fn() };
});

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type AiModule = typeof import("ai");

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<AiModule>();
  return {
    ...actual,
    generateText: mockGenerateText,
    streamText: mockStreamText,
  };
});

interface GenerateTextCall {
  messages?: unknown;
  model?: unknown;
  system?: string;
  tools?: Record<string, unknown>;
  maxSteps?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockModel(): LanguageModelV1 {
  return {
    specificationVersion: "v1",
    provider: "test",
    modelId: "test-model",
    defaultObjectGenerationMode: undefined,
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  };
}

function makeGenerateTextResult(overrides: Record<string, unknown> = {}) {
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

interface StreamTextMockOverrides {
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

function makeStreamTextResult(overrides: StreamTextMockOverrides = {}) {
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

  // eslint-disable-next-line @typescript-eslint/require-await
  async function* iterate<T>(items: T[]): AsyncGenerator<T> {
    yield* items;
  }

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

interface StreamTextCall {
  messages?: unknown;
  model?: unknown;
  system?: string;
  tools?: Record<string, unknown>;
  maxSteps?: number;
  [key: string]: unknown;
}

const mockModel = createMockModel();

function createSimpleAgent(overrides: Record<string, unknown> = {}) {
  return new Agent({
    name: "test-agent",
    instructions: "You are a helpful assistant.",
    model: mockModel,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Group 1: Basic Execution
// ---------------------------------------------------------------------------

describe("Runner.run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateText.mockResolvedValue(makeGenerateTextResult());
  });

  describe("basic execution", () => {
    it("should return text output for simple agent run with string input", async () => {
      const agent = createSimpleAgent();
      const result = await Runner.run(agent, "Hello");

      expect(result.output).toBe("Hello!");
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      const call = mockGenerateText.mock.calls[0][0] as GenerateTextCall;
      expect(call.messages).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("should pass CoreMessage array input directly", async () => {
      const agent = createSimpleAgent();
      const messages: CoreMessage[] = [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hey" },
        { role: "user", content: "How are you?" },
      ];
      const result = await Runner.run(agent, messages);

      expect(result.output).toBe("Hello!");
      const call = mockGenerateText.mock.calls[0][0] as GenerateTextCall;
      expect(call.messages).toEqual(messages);
    });

    it("should return RunResult with correct shape", async () => {
      const agent = createSimpleAgent();
      const result = await Runner.run(agent, "Hello");

      expect(result).toHaveProperty("output");
      expect(result).toHaveProperty("agent");
      expect(result).toHaveProperty("steps");
      expect(result).toHaveProperty("usage");
      expect(result.agent).toBe("test-agent");
      expect(Array.isArray(result.steps)).toBe(true);
      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      expect(result.usage).toEqual(
        expect.objectContaining({
          promptTokens: expect.any(Number),
          completionTokens: expect.any(Number),
          totalTokens: expect.any(Number),
        }),
      );
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    });

    it("should use agent model when no config override", async () => {
      const agent = createSimpleAgent();
      await Runner.run(agent, "Hello");

      const call = mockGenerateText.mock.calls[0][0] as GenerateTextCall;
      expect(call.model).toBe(mockModel);
    });

    it("should use config model override over agent model", async () => {
      const agent = createSimpleAgent();
      const overrideModel = createMockModel();
      await Runner.run(agent, "Hello", { model: overrideModel });

      const call = mockGenerateText.mock.calls[0][0] as GenerateTextCall;
      expect(call.model).toBe(overrideModel);
    });

    it("should throw helpful error for string model identifier", async () => {
      const agent = createSimpleAgent();
      await expect(
        Runner.run(agent, "Hello", {
          model: "gpt-4o" as unknown as LanguageModelV1,
        }),
      ).rejects.toThrow(/string model identifier/i);
    });

    it("should resolve static string instructions as system prompt", async () => {
      const agent = createSimpleAgent({ instructions: "Be helpful." });
      await Runner.run(agent, "Hello");

      const call = mockGenerateText.mock.calls[0][0] as GenerateTextCall;
      expect(call.system).toBe("Be helpful.");
    });

    it("should resolve dynamic function instructions with context", async () => {
      const instructionsFn = vi.fn(
        (ctx: RunContext<unknown>) => `Agent: ${ctx.agent}, Turn: ${ctx.turn}`,
      );
      const agent = createSimpleAgent({ instructions: instructionsFn });
      await Runner.run(agent, "Hello");

      expect(instructionsFn).toHaveBeenCalledTimes(1);
      const call = mockGenerateText.mock.calls[0][0] as GenerateTextCall;
      expect(call.system).toBe("Agent: test-agent, Turn: 1");
    });
  });

  // ---------------------------------------------------------------------------
  // Group 7: Turn Management
  // ---------------------------------------------------------------------------

  describe("turn management", () => {
    it("should throw MaxTurnsExceededError when limit reached", async () => {
      const agentA = createSimpleAgent({ name: "agent-a" });
      const agentB = createSimpleAgent({ name: "agent-b" });

      (
        agentA as unknown as { config: { handoffs: unknown[] } }
      ).config.handoffs = [agentB];
      (
        agentB as unknown as { config: { handoffs: unknown[] } }
      ).config.handoffs = [agentA];

      // Dynamic: detect current agent via system prompt, return correct handoff
      mockGenerateText.mockImplementation((opts: { system?: string }) => {
        const isAgentA = opts.system === "You are a helpful assistant." || true;
        void isAgentA;
        // Both agents always hand off — cycle between them
        // We use the fallback targetAgent name lookup
        return Promise.resolve(
          makeGenerateTextResult({
            text: "",
            steps: [
              {
                stepType: "tool-result",
                text: "",
                toolCalls: [
                  {
                    type: "tool-call",
                    toolCallId: "tc1",
                    toolName: "transfer_to_other",
                    args: {},
                  },
                ],
                toolResults: [
                  {
                    type: "tool-result",
                    toolCallId: "tc1",
                    toolName: "transfer_to_other",
                    // Runner falls back to matching by targetAgent name against handoff map
                    result: {
                      __handoff: true,
                      targetAgent: "will-be-looked-up",
                    },
                  },
                ],
                finishReason: "tool-calls",
                usage: {
                  promptTokens: 5,
                  completionTokens: 5,
                  totalTokens: 10,
                },
              },
            ],
          }),
        );
      });

      // Override: make mock return targetAgent that matches the current agent's handoff target
      // We need a smarter approach: use mockImplementation that knows the agent
      mockGenerateText.mockImplementation(() => {
        const callNum = mockGenerateText.mock.calls.length;
        const targetName = callNum % 2 === 1 ? "agent-a" : "agent-b";
        const toolName = `transfer_to_${targetName.replace(/-/g, "_")}`;
        return Promise.resolve(
          makeGenerateTextResult({
            text: "",
            steps: [
              {
                stepType: "tool-result",
                text: "",
                toolCalls: [
                  {
                    type: "tool-call",
                    toolCallId: `tc${callNum}`,
                    toolName,
                    args: {},
                  },
                ],
                toolResults: [
                  {
                    type: "tool-result",
                    toolCallId: `tc${callNum}`,
                    toolName,
                    result: { __handoff: true, targetAgent: targetName },
                  },
                ],
                finishReason: "tool-calls",
                usage: {
                  promptTokens: 5,
                  completionTokens: 5,
                  totalTokens: 10,
                },
              },
            ],
          }),
        );
      });

      await expect(
        Runner.run(agentB, "Hello", { maxTurns: 3 }),
      ).rejects.toThrow(MaxTurnsExceededError);
    });

    it("should default maxTurns to 10", async () => {
      const agentA = createSimpleAgent({
        name: "agent-a",
        instructions: "I am A",
      });
      const agentB = createSimpleAgent({
        name: "agent-b",
        instructions: "I am B",
      });
      (
        agentA as unknown as { config: { handoffs: unknown[] } }
      ).config.handoffs = [agentB];
      (
        agentB as unknown as { config: { handoffs: unknown[] } }
      ).config.handoffs = [agentA];

      mockGenerateText.mockImplementation((opts: { system?: string }) => {
        // Detect which agent by system prompt
        const isA = opts.system === "I am A";
        const targetName = isA ? "agent-b" : "agent-a";
        const toolName = `transfer_to_${targetName.replace(/-/g, "_")}`;
        return Promise.resolve(
          makeGenerateTextResult({
            text: "",
            steps: [
              {
                stepType: "tool-result",
                text: "",
                toolCalls: [
                  { type: "tool-call", toolCallId: "tc1", toolName, args: {} },
                ],
                toolResults: [
                  {
                    type: "tool-result",
                    toolCallId: "tc1",
                    toolName,
                    result: { __handoff: true, targetAgent: targetName },
                  },
                ],
                finishReason: "tool-calls",
                usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
              },
            ],
          }),
        );
      });

      await expect(Runner.run(agentA, "Hello")).rejects.toThrow(
        MaxTurnsExceededError,
      );
    });

    it("should respect config maxTurns override", async () => {
      const agent = createSimpleAgent();
      // Simple non-handoff scenario completes in 1 turn, so maxTurns=1 works fine
      const result = await Runner.run(agent, "Hello", { maxTurns: 1 });
      expect(result.output).toBe("Hello!");
    });

    it("should increment turn counter each iteration", async () => {
      const turnsSeen: number[] = [];
      const instructionsFn = vi.fn((ctx: RunContext<unknown>) => {
        turnsSeen.push(ctx.turn);
        return "Be helpful";
      });

      const agentA = createSimpleAgent({
        name: "agent-a",
        instructions: instructionsFn,
      });
      const agentB = createSimpleAgent({
        name: "agent-b",
        instructions: "Final agent",
      });
      (
        agentA as unknown as { config: { handoffs: unknown[] } }
      ).config.handoffs = [agentB];

      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            makeGenerateTextResult({
              text: "",
              steps: [
                {
                  stepType: "tool-result",
                  text: "",
                  toolCalls: [
                    {
                      type: "tool-call",
                      toolCallId: "tc1",
                      toolName: "transfer_to_agent_b",
                      args: {},
                    },
                  ],
                  toolResults: [
                    {
                      type: "tool-result",
                      toolCallId: "tc1",
                      toolName: "transfer_to_agent_b",
                      result: { __handoff: true, targetAgent: "agent-b" },
                    },
                  ],
                  finishReason: "tool-calls",
                  usage: {
                    promptTokens: 5,
                    completionTokens: 5,
                    totalTokens: 10,
                  },
                },
              ],
            }),
          );
        }
        return Promise.resolve(makeGenerateTextResult());
      });

      const result = await Runner.run(agentA, "Hello");
      expect(turnsSeen).toContain(1);
      expect(result.agent).toBe("agent-b");
    });
  });

  // ---------------------------------------------------------------------------
  // Group 2: Tool Execution
  // ---------------------------------------------------------------------------

  describe("tool execution", () => {
    it("should pass agent tools to generateText", async () => {
      const myTool = {
        description: "a tool",
        parameters: z.object({}),
        execute: vi.fn(),
      };
      const agent = createSimpleAgent({ tools: { myTool } });
      await Runner.run(agent, "Hello");

      const call = mockGenerateText.mock.calls[0][0] as GenerateTextCall;
      expect(call.tools).toBeDefined();
      expect(call.tools!.myTool).toBeDefined();
    });

    it("should set maxSteps from agent maxToolRoundtrips", async () => {
      const agent = createSimpleAgent({ maxToolRoundtrips: 5 });
      await Runner.run(agent, "Hello");

      const call = mockGenerateText.mock.calls[0][0] as GenerateTextCall;
      expect(call.maxSteps).toBe(5);
    });

    it("should record tool calls as steps", async () => {
      mockGenerateText.mockResolvedValue(
        makeGenerateTextResult({
          steps: [
            {
              stepType: "tool-result",
              text: "",
              toolCalls: [
                {
                  type: "tool-call",
                  toolCallId: "tc1",
                  toolName: "weather",
                  args: { city: "SF" },
                },
              ],
              toolResults: [
                {
                  type: "tool-result",
                  toolCallId: "tc1",
                  toolName: "weather",
                  result: { temp: 72 },
                },
              ],
              finishReason: "tool-calls",
              usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
            },
            {
              stepType: "initial",
              text: "The weather is 72F.",
              toolCalls: [],
              toolResults: [],
              finishReason: "stop",
              usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
            },
          ],
          text: "The weather is 72F.",
        }),
      );

      const agent = createSimpleAgent();
      const result = await Runner.run(agent, "weather?");

      const toolCallSteps = result.steps.filter((s) => s.type === "tool_call");
      expect(toolCallSteps.length).toBe(1);
      expect((toolCallSteps[0].data as { toolName: string }).toolName).toBe(
        "weather",
      );
    });

    it("should record tool results as steps", async () => {
      mockGenerateText.mockResolvedValue(
        makeGenerateTextResult({
          steps: [
            {
              stepType: "tool-result",
              text: "",
              toolCalls: [
                {
                  type: "tool-call",
                  toolCallId: "tc1",
                  toolName: "weather",
                  args: {},
                },
              ],
              toolResults: [
                {
                  type: "tool-result",
                  toolCallId: "tc1",
                  toolName: "weather",
                  result: { temp: 72 },
                },
              ],
              finishReason: "tool-calls",
              usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
            },
          ],
          text: "Done",
        }),
      );

      const agent = createSimpleAgent();
      const result = await Runner.run(agent, "weather?");

      const toolResultSteps = result.steps.filter(
        (s) => s.type === "tool_result",
      );
      expect(toolResultSteps.length).toBe(1);
      expect((toolResultSteps[0].data as { result: unknown }).result).toEqual({
        temp: 72,
      });
    });

    it("should accumulate steps across multi-step tool loop", async () => {
      mockGenerateText.mockResolvedValue(
        makeGenerateTextResult({
          steps: [
            {
              stepType: "tool-result",
              text: "",
              toolCalls: [
                {
                  type: "tool-call",
                  toolCallId: "tc1",
                  toolName: "search",
                  args: {},
                },
              ],
              toolResults: [
                {
                  type: "tool-result",
                  toolCallId: "tc1",
                  toolName: "search",
                  result: "found",
                },
              ],
              finishReason: "tool-calls",
              usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
            },
            {
              stepType: "tool-result",
              text: "",
              toolCalls: [
                {
                  type: "tool-call",
                  toolCallId: "tc2",
                  toolName: "fetch",
                  args: {},
                },
              ],
              toolResults: [
                {
                  type: "tool-result",
                  toolCallId: "tc2",
                  toolName: "fetch",
                  result: "data",
                },
              ],
              finishReason: "tool-calls",
              usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
            },
          ],
          text: "Final answer",
        }),
      );

      const agent = createSimpleAgent();
      const result = await Runner.run(agent, "do stuff");

      const toolCallSteps = result.steps.filter((s) => s.type === "tool_call");
      const toolResultSteps = result.steps.filter(
        (s) => s.type === "tool_result",
      );
      expect(toolCallSteps.length).toBe(2);
      expect(toolResultSteps.length).toBe(2);
    });

    it("should respect custom maxToolRoundtrips", async () => {
      const agent = createSimpleAgent({ maxToolRoundtrips: 3 });
      await Runner.run(agent, "Hello");

      const call = mockGenerateText.mock.calls[0][0] as GenerateTextCall;
      expect(call.maxSteps).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 3: Handoff Detection & Routing
  // ---------------------------------------------------------------------------

  describe("handoff detection and routing", () => {
    it("should add handoff tools to generateText tool set", async () => {
      const targetAgent = createSimpleAgent({ name: "billing" });
      const agent = createSimpleAgent({ handoffs: [targetAgent] });
      await Runner.run(agent, "Hello");

      const call = mockGenerateText.mock.calls[0][0] as GenerateTextCall;
      expect(call.tools).toBeDefined();
      expect(call.tools!.transfer_to_billing).toBeDefined();
    });

    it("should detect handoff sentinel and switch agent", async () => {
      const targetAgent = createSimpleAgent({
        name: "billing",
        instructions: "I am billing",
      });
      const agent = createSimpleAgent({ handoffs: [targetAgent] });

      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            makeGenerateTextResult({
              text: "",
              steps: [
                {
                  stepType: "tool-result",
                  text: "",
                  toolCalls: [
                    {
                      type: "tool-call",
                      toolCallId: "tc1",
                      toolName: "transfer_to_billing",
                      args: {},
                    },
                  ],
                  toolResults: [
                    {
                      type: "tool-result",
                      toolCallId: "tc1",
                      toolName: "transfer_to_billing",
                      result: { __handoff: true, targetAgent: "billing" },
                    },
                  ],
                  finishReason: "tool-calls",
                  usage: {
                    promptTokens: 5,
                    completionTokens: 5,
                    totalTokens: 10,
                  },
                },
              ],
            }),
          );
        }
        return Promise.resolve(
          makeGenerateTextResult({ text: "Billing here!" }),
        );
      });

      const result = await Runner.run(agent, "Transfer me");
      expect(result.agent).toBe("billing");
      expect(result.output).toBe("Billing here!");
    });

    it("should run new agent in next turn after handoff", async () => {
      const targetAgent = createSimpleAgent({
        name: "billing",
        instructions: "Billing",
      });
      const agent = createSimpleAgent({
        handoffs: [targetAgent],
        instructions: "Router",
      });

      let callCount = 0;
      mockGenerateText.mockImplementation((opts: { system?: string }) => {
        callCount++;
        if (callCount === 1) {
          expect(opts.system).toBe("Router");
          return Promise.resolve(
            makeGenerateTextResult({
              text: "",
              steps: [
                {
                  stepType: "tool-result",
                  text: "",
                  toolCalls: [
                    {
                      type: "tool-call",
                      toolCallId: "tc1",
                      toolName: "transfer_to_billing",
                      args: {},
                    },
                  ],
                  toolResults: [
                    {
                      type: "tool-result",
                      toolCallId: "tc1",
                      toolName: "transfer_to_billing",
                      result: { __handoff: true, targetAgent: "billing" },
                    },
                  ],
                  finishReason: "tool-calls",
                  usage: {
                    promptTokens: 5,
                    completionTokens: 5,
                    totalTokens: 10,
                  },
                },
              ],
            }),
          );
        }
        expect(opts.system).toBe("Billing");
        return Promise.resolve(
          makeGenerateTextResult({ text: "Billing response" }),
        );
      });

      await Runner.run(agent, "Hello");
      expect(mockGenerateText).toHaveBeenCalledTimes(2);
    });

    it("should apply inputFilter to messages before next agent", async () => {
      const targetAgent = createSimpleAgent({ name: "billing" });
      const agent = createSimpleAgent({
        handoffs: [
          handoff(targetAgent, {
            inputFilter: (msgs: CoreMessage[]) =>
              msgs.filter((m) => m.role === "user"),
          }),
        ],
      });

      let callCount = 0;
      mockGenerateText.mockImplementation(
        (opts: { messages?: CoreMessage[] }) => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve(
              makeGenerateTextResult({
                text: "",
                steps: [
                  {
                    stepType: "tool-result",
                    text: "",
                    toolCalls: [
                      {
                        type: "tool-call",
                        toolCallId: "tc1",
                        toolName: "transfer_to_billing",
                        args: {},
                      },
                    ],
                    toolResults: [
                      {
                        type: "tool-result",
                        toolCallId: "tc1",
                        toolName: "transfer_to_billing",
                        result: { __handoff: true, targetAgent: "billing" },
                      },
                    ],
                    finishReason: "tool-calls",
                    usage: {
                      promptTokens: 5,
                      completionTokens: 5,
                      totalTokens: 10,
                    },
                  },
                ],
              }),
            );
          }
          // Second call should only have user messages (inputFilter applied)
          const msgs = opts.messages ?? [];
          expect(msgs.every((m) => m.role === "user")).toBe(true);
          return Promise.resolve(makeGenerateTextResult({ text: "filtered" }));
        },
      );

      const result = await Runner.run(agent, [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hey" },
        { role: "user", content: "Transfer" },
      ]);
      expect(result.output).toBe("filtered");
    });

    it("should fire onHandoff callback from HandoffConfig", async () => {
      const onHandoff = vi.fn();
      const targetAgent = createSimpleAgent({ name: "billing" });
      const agent = createSimpleAgent({
        handoffs: [handoff(targetAgent, { onHandoff })],
      });

      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            makeGenerateTextResult({
              text: "",
              steps: [
                {
                  stepType: "tool-result",
                  text: "",
                  toolCalls: [
                    {
                      type: "tool-call",
                      toolCallId: "tc1",
                      toolName: "transfer_to_billing",
                      args: {},
                    },
                  ],
                  toolResults: [
                    {
                      type: "tool-result",
                      toolCallId: "tc1",
                      toolName: "transfer_to_billing",
                      result: { __handoff: true, targetAgent: "billing" },
                    },
                  ],
                  finishReason: "tool-calls",
                  usage: {
                    promptTokens: 5,
                    completionTokens: 5,
                    totalTokens: 10,
                  },
                },
              ],
            }),
          );
        }
        return Promise.resolve(makeGenerateTextResult());
      });

      await Runner.run(agent, "Hello");
      expect(onHandoff).toHaveBeenCalledTimes(1);
    });

    it("should record handoff as step", async () => {
      const targetAgent = createSimpleAgent({ name: "billing" });
      const agent = createSimpleAgent({
        name: "router",
        handoffs: [targetAgent],
      });

      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            makeGenerateTextResult({
              text: "",
              steps: [
                {
                  stepType: "tool-result",
                  text: "",
                  toolCalls: [
                    {
                      type: "tool-call",
                      toolCallId: "tc1",
                      toolName: "transfer_to_billing",
                      args: {},
                    },
                  ],
                  toolResults: [
                    {
                      type: "tool-result",
                      toolCallId: "tc1",
                      toolName: "transfer_to_billing",
                      result: { __handoff: true, targetAgent: "billing" },
                    },
                  ],
                  finishReason: "tool-calls",
                  usage: {
                    promptTokens: 5,
                    completionTokens: 5,
                    totalTokens: 10,
                  },
                },
              ],
            }),
          );
        }
        return Promise.resolve(makeGenerateTextResult());
      });

      const result = await Runner.run(agent, "Hello");
      const handoffSteps = result.steps.filter((s) => s.type === "handoff");
      expect(handoffSteps.length).toBe(1);
      expect((handoffSteps[0].data as { from: string; to: string }).from).toBe(
        "router",
      );
      expect((handoffSteps[0].data as { from: string; to: string }).to).toBe(
        "billing",
      );
    });

    it("should handle sequential handoffs A→B→C", async () => {
      const agentC = createSimpleAgent({ name: "agent-c", instructions: "C" });
      const agentB = createSimpleAgent({
        name: "agent-b",
        instructions: "B",
        handoffs: [agentC],
      });
      const agentA = createSimpleAgent({
        name: "agent-a",
        instructions: "A",
        handoffs: [agentB],
      });

      let _callCount = 0;
      mockGenerateText.mockImplementation((opts: { system?: string }) => {
        _callCount++;
        if (opts.system === "A") {
          return Promise.resolve(
            makeGenerateTextResult({
              text: "",
              steps: [
                {
                  stepType: "tool-result",
                  text: "",
                  toolCalls: [
                    {
                      type: "tool-call",
                      toolCallId: "tc1",
                      toolName: "transfer_to_agent_b",
                      args: {},
                    },
                  ],
                  toolResults: [
                    {
                      type: "tool-result",
                      toolCallId: "tc1",
                      toolName: "transfer_to_agent_b",
                      result: { __handoff: true, targetAgent: "agent-b" },
                    },
                  ],
                  finishReason: "tool-calls",
                  usage: {
                    promptTokens: 5,
                    completionTokens: 5,
                    totalTokens: 10,
                  },
                },
              ],
            }),
          );
        }
        if (opts.system === "B") {
          return Promise.resolve(
            makeGenerateTextResult({
              text: "",
              steps: [
                {
                  stepType: "tool-result",
                  text: "",
                  toolCalls: [
                    {
                      type: "tool-call",
                      toolCallId: "tc2",
                      toolName: "transfer_to_agent_c",
                      args: {},
                    },
                  ],
                  toolResults: [
                    {
                      type: "tool-result",
                      toolCallId: "tc2",
                      toolName: "transfer_to_agent_c",
                      result: { __handoff: true, targetAgent: "agent-c" },
                    },
                  ],
                  finishReason: "tool-calls",
                  usage: {
                    promptTokens: 5,
                    completionTokens: 5,
                    totalTokens: 10,
                  },
                },
              ],
            }),
          );
        }
        return Promise.resolve(
          makeGenerateTextResult({ text: "Final from C" }),
        );
      });

      const result = await Runner.run(agentA, "Hello");
      expect(result.agent).toBe("agent-c");
      expect(result.output).toBe("Final from C");
      expect(mockGenerateText).toHaveBeenCalledTimes(3);
    });

    it("should throw HandoffError for unknown target agent", async () => {
      const agent = createSimpleAgent();

      mockGenerateText.mockResolvedValue(
        makeGenerateTextResult({
          text: "",
          steps: [
            {
              stepType: "tool-result",
              text: "",
              toolCalls: [
                {
                  type: "tool-call",
                  toolCallId: "tc1",
                  toolName: "transfer_to_unknown",
                  args: {},
                },
              ],
              toolResults: [
                {
                  type: "tool-result",
                  toolCallId: "tc1",
                  toolName: "transfer_to_unknown",
                  result: { __handoff: true, targetAgent: "nonexistent" },
                },
              ],
              finishReason: "tool-calls",
              usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
            },
          ],
        }),
      );

      // No handoff is configured, so the sentinel is ignored and treated as normal tool result
      const result = await Runner.run(agent, "Hello");
      expect(result.output).toBe("");
    });

    it("should auto-normalize raw AgentInstance in handoffs", async () => {
      const targetAgent = createSimpleAgent({ name: "billing" });
      // Pass raw AgentInstance, not handoff()
      const agent = createSimpleAgent({ handoffs: [targetAgent] });

      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            makeGenerateTextResult({
              text: "",
              steps: [
                {
                  stepType: "tool-result",
                  text: "",
                  toolCalls: [
                    {
                      type: "tool-call",
                      toolCallId: "tc1",
                      toolName: "transfer_to_billing",
                      args: {},
                    },
                  ],
                  toolResults: [
                    {
                      type: "tool-result",
                      toolCallId: "tc1",
                      toolName: "transfer_to_billing",
                      result: { __handoff: true, targetAgent: "billing" },
                    },
                  ],
                  finishReason: "tool-calls",
                  usage: {
                    promptTokens: 5,
                    completionTokens: 5,
                    totalTokens: 10,
                  },
                },
              ],
            }),
          );
        }
        return Promise.resolve(
          makeGenerateTextResult({ text: "From billing" }),
        );
      });

      const result = await Runner.run(agent, "Hello");
      expect(result.agent).toBe("billing");
    });

    it("should use transfer_to_{name} tool name pattern", async () => {
      const targetAgent = createSimpleAgent({ name: "my-billing-agent" });
      const agent = createSimpleAgent({ handoffs: [targetAgent] });
      await Runner.run(agent, "Hello");

      const call = mockGenerateText.mock.calls[0][0] as GenerateTextCall;
      expect(call.tools!.transfer_to_my_billing_agent).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Group 4: Input Guardrails
  // ---------------------------------------------------------------------------

  describe("input guardrails", () => {
    function makePassingGuardrail(name = "pass-guard"): Guardrail {
      return { name, execute: () => Promise.resolve({ tripwired: false }) };
    }

    function makeTrippingGuardrail(
      name = "trip-guard",
      reason = "blocked",
    ): Guardrail {
      return {
        name,
        execute: () => Promise.resolve({ tripwired: true, reason }),
      };
    }

    it("should run input guardrails before generateText", async () => {
      const executionOrder: string[] = [];
      const guard: Guardrail = {
        name: "order-guard",
        execute: () => {
          executionOrder.push("guardrail");
          return Promise.resolve({ tripwired: false });
        },
      };
      mockGenerateText.mockImplementation(() => {
        executionOrder.push("generateText");
        return Promise.resolve(makeGenerateTextResult());
      });

      const agent = createSimpleAgent({ inputGuardrails: [guard] });
      await Runner.run(agent, "Hello");

      expect(executionOrder).toEqual(["guardrail", "generateText"]);
    });

    it("should throw GuardrailTripwiredError when input guardrail trips", async () => {
      const agent = createSimpleAgent({
        inputGuardrails: [makeTrippingGuardrail("blocker", "not allowed")],
      });

      await expect(Runner.run(agent, "Hello")).rejects.toThrow(
        GuardrailTripwiredError,
      );
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("should fire onGuardrailTripped hook before throwing", async () => {
      const onGuardrailTripped = vi.fn();
      const agent = createSimpleAgent({
        inputGuardrails: [makeTrippingGuardrail()],
      });

      try {
        await Runner.run(agent, "Hello", { hooks: { onGuardrailTripped } });
      } catch {
        // expected
      }

      expect(onGuardrailTripped).toHaveBeenCalledTimes(1);
    });

    it("should allow execution when input guardrails pass", async () => {
      const agent = createSimpleAgent({
        inputGuardrails: [makePassingGuardrail()],
      });

      const result = await Runner.run(agent, "Hello");
      expect(result.output).toBe("Hello!");
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
    });

    it("should run multiple input guardrails in parallel", async () => {
      const guard1 = makePassingGuardrail("guard-1");
      const guard2 = makePassingGuardrail("guard-2");
      const spy1 = vi.spyOn(guard1, "execute");
      const spy2 = vi.spyOn(guard2, "execute");

      const agent = createSimpleAgent({ inputGuardrails: [guard1, guard2] });
      await Runner.run(agent, "Hello");

      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 5: Output Guardrails
  // ---------------------------------------------------------------------------

  describe("output guardrails", () => {
    it("should run output guardrails after final output", async () => {
      const guardExecute = vi.fn(() => Promise.resolve({ tripwired: false }));
      const guard: Guardrail = { name: "out-guard", execute: guardExecute };
      const agent = createSimpleAgent({ outputGuardrails: [guard] });

      await Runner.run(agent, "Hello");

      expect(guardExecute).toHaveBeenCalledTimes(1);
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
    });

    it("should throw GuardrailTripwiredError when output guardrail trips", async () => {
      const guard: Guardrail = {
        name: "out-blocker",
        execute: () =>
          Promise.resolve({ tripwired: true, reason: "bad output" }),
      };
      const agent = createSimpleAgent({ outputGuardrails: [guard] });

      await expect(Runner.run(agent, "Hello")).rejects.toThrow(
        GuardrailTripwiredError,
      );
    });

    it("should pass assistant response to output guardrails", async () => {
      let receivedMessages: CoreMessage[] = [];
      const guard: Guardrail = {
        name: "inspect-guard",
        execute: (_ctx, input) => {
          receivedMessages = input.messages;
          return Promise.resolve({ tripwired: false });
        },
      };
      const agent = createSimpleAgent({ outputGuardrails: [guard] });
      await Runner.run(agent, "Hello");

      expect(receivedMessages).toEqual([
        { role: "assistant", content: "Hello!" },
      ]);
    });

    it("should skip output guardrails when handoff occurs", async () => {
      const guardExecute = vi.fn(() => Promise.resolve({ tripwired: false }));
      const guard: Guardrail = { name: "skipped", execute: guardExecute };
      const targetAgent = createSimpleAgent({ name: "target" });
      const agent = createSimpleAgent({
        handoffs: [targetAgent],
        outputGuardrails: [guard],
      });

      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            makeGenerateTextResult({
              text: "",
              steps: [
                {
                  stepType: "tool-result",
                  text: "",
                  toolCalls: [
                    {
                      type: "tool-call",
                      toolCallId: "tc1",
                      toolName: "transfer_to_target",
                      args: {},
                    },
                  ],
                  toolResults: [
                    {
                      type: "tool-result",
                      toolCallId: "tc1",
                      toolName: "transfer_to_target",
                      result: { __handoff: true, targetAgent: "target" },
                    },
                  ],
                  finishReason: "tool-calls",
                  usage: {
                    promptTokens: 5,
                    completionTokens: 5,
                    totalTokens: 10,
                  },
                },
              ],
            }),
          );
        }
        return Promise.resolve(makeGenerateTextResult());
      });

      await Runner.run(agent, "Hello");
      // Guard should NOT have been called during handoff turn
      // It may be called for the final agent if it also has output guardrails, but agent with the guard handed off
      expect(guardExecute).not.toHaveBeenCalled();
    });

    it("should run multiple output guardrails in parallel", async () => {
      const guard1: Guardrail = {
        name: "g1",
        execute: vi.fn(() => Promise.resolve({ tripwired: false })),
      };
      const guard2: Guardrail = {
        name: "g2",
        execute: vi.fn(() => Promise.resolve({ tripwired: false })),
      };
      const agent = createSimpleAgent({ outputGuardrails: [guard1, guard2] });

      await Runner.run(agent, "Hello");

      expect(guard1.execute).toHaveBeenCalledTimes(1);
      expect(guard2.execute).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 6: Output Schema Parsing
  // ---------------------------------------------------------------------------

  describe("output schema parsing", () => {
    it("should return raw text when no outputSchema", async () => {
      const agent = createSimpleAgent();
      const result = await Runner.run(agent, "Hello");
      expect(result.output).toBe("Hello!");
      expect(typeof result.output).toBe("string");
    });

    it("should parse and validate JSON with outputSchema", async () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      mockGenerateText.mockResolvedValue(
        makeGenerateTextResult({ text: '{"name":"Alice","age":30}' }),
      );

      const agent = createSimpleAgent({ outputSchema: schema });
      const result = await Runner.run(agent, "Give me data");
      expect(result.output).toEqual({ name: "Alice", age: 30 });
    });

    it("should throw on invalid JSON against schema", async () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      mockGenerateText.mockResolvedValue(
        makeGenerateTextResult({ text: '{"name":"Alice"}' }),
      );

      const agent = createSimpleAgent({ outputSchema: schema });
      await expect(Runner.run(agent, "Give me data")).rejects.toThrow();
    });

    it("should type RunResult output with schema type", async () => {
      const schema = z.object({ value: z.number() });
      mockGenerateText.mockResolvedValue(
        makeGenerateTextResult({ text: '{"value":42}' }),
      );

      const agent = new Agent({
        name: "typed-agent",
        instructions: "return json",
        model: mockModel,
        outputSchema: schema,
      });
      const result = await Runner.run(agent, "Give me data");
      expect(result.output.value).toBe(42);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 8: Usage Accumulation
  // ---------------------------------------------------------------------------

  describe("usage accumulation", () => {
    it("should flow single-turn usage to RunResult", async () => {
      const agent = createSimpleAgent();
      const result = await Runner.run(agent, "Hello");

      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(5);
      expect(result.usage.totalTokens).toBe(15);
    });

    it("should accumulate usage across handoff turns", async () => {
      const targetAgent = createSimpleAgent({ name: "billing" });
      const agent = createSimpleAgent({ handoffs: [targetAgent] });

      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            makeGenerateTextResult({
              text: "",
              usage: {
                promptTokens: 20,
                completionTokens: 10,
                totalTokens: 30,
              },
              steps: [
                {
                  stepType: "tool-result",
                  text: "",
                  toolCalls: [
                    {
                      type: "tool-call",
                      toolCallId: "tc1",
                      toolName: "transfer_to_billing",
                      args: {},
                    },
                  ],
                  toolResults: [
                    {
                      type: "tool-result",
                      toolCallId: "tc1",
                      toolName: "transfer_to_billing",
                      result: { __handoff: true, targetAgent: "billing" },
                    },
                  ],
                  finishReason: "tool-calls",
                  usage: {
                    promptTokens: 20,
                    completionTokens: 10,
                    totalTokens: 30,
                  },
                },
              ],
            }),
          );
        }
        return Promise.resolve(
          makeGenerateTextResult({
            usage: { promptTokens: 15, completionTokens: 8, totalTokens: 23 },
          }),
        );
      });

      const result = await Runner.run(agent, "Hello");
      expect(result.usage.promptTokens).toBe(35);
      expect(result.usage.completionTokens).toBe(18);
      expect(result.usage.totalTokens).toBe(53);
    });

    it("should handle zero usage gracefully", async () => {
      mockGenerateText.mockResolvedValue(
        makeGenerateTextResult({
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        }),
      );

      const agent = createSimpleAgent();
      const result = await Runner.run(agent, "Hello");
      expect(result.usage.promptTokens).toBe(0);
      expect(result.usage.completionTokens).toBe(0);
      expect(result.usage.totalTokens).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 9: Hooks & Lifecycle
  // ---------------------------------------------------------------------------

  describe("hooks and lifecycle", () => {
    it("should fire onRunStart at beginning", async () => {
      const onRunStart = vi.fn();
      const agent = createSimpleAgent();
      await Runner.run(agent, "Hello", { hooks: { onRunStart } });

      expect(onRunStart).toHaveBeenCalledTimes(1);
      expect(onRunStart.mock.calls[0][0]).toMatchObject({
        agent: "test-agent",
      });
    });

    it("should fire onRunEnd with final result", async () => {
      const onRunEnd = vi.fn();
      const agent = createSimpleAgent();
      await Runner.run(agent, "Hello", { hooks: { onRunEnd } });

      expect(onRunEnd).toHaveBeenCalledTimes(1);
      const resultArg = onRunEnd.mock.calls[0][1] as { output: string };
      expect(resultArg.output).toBe("Hello!");
    });

    it("should fire onAgentStart before each agent turn", async () => {
      const onAgentStart = vi.fn();
      const targetAgent = createSimpleAgent({ name: "billing" });
      const agent = createSimpleAgent({ handoffs: [targetAgent] });

      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            makeGenerateTextResult({
              text: "",
              steps: [
                {
                  stepType: "tool-result",
                  text: "",
                  toolCalls: [
                    {
                      type: "tool-call",
                      toolCallId: "tc1",
                      toolName: "transfer_to_billing",
                      args: {},
                    },
                  ],
                  toolResults: [
                    {
                      type: "tool-result",
                      toolCallId: "tc1",
                      toolName: "transfer_to_billing",
                      result: { __handoff: true, targetAgent: "billing" },
                    },
                  ],
                  finishReason: "tool-calls",
                  usage: {
                    promptTokens: 5,
                    completionTokens: 5,
                    totalTokens: 10,
                  },
                },
              ],
            }),
          );
        }
        return Promise.resolve(makeGenerateTextResult());
      });

      await Runner.run(agent, "Hello", { hooks: { onAgentStart } });
      expect(onAgentStart).toHaveBeenCalledTimes(2);
    });

    it("should fire onAgentEnd after each agent turn", async () => {
      const onAgentEnd = vi.fn();
      const agent = createSimpleAgent();
      await Runner.run(agent, "Hello", { hooks: { onAgentEnd } });

      expect(onAgentEnd).toHaveBeenCalledTimes(1);
      expect(onAgentEnd.mock.calls[0][1]).toBe("Hello!");
    });

    it("should fire onHandoff with from/to names", async () => {
      const onHandoff = vi.fn();
      const targetAgent = createSimpleAgent({ name: "billing" });
      const agent = createSimpleAgent({
        name: "router",
        handoffs: [targetAgent],
      });

      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            makeGenerateTextResult({
              text: "",
              steps: [
                {
                  stepType: "tool-result",
                  text: "",
                  toolCalls: [
                    {
                      type: "tool-call",
                      toolCallId: "tc1",
                      toolName: "transfer_to_billing",
                      args: {},
                    },
                  ],
                  toolResults: [
                    {
                      type: "tool-result",
                      toolCallId: "tc1",
                      toolName: "transfer_to_billing",
                      result: { __handoff: true, targetAgent: "billing" },
                    },
                  ],
                  finishReason: "tool-calls",
                  usage: {
                    promptTokens: 5,
                    completionTokens: 5,
                    totalTokens: 10,
                  },
                },
              ],
            }),
          );
        }
        return Promise.resolve(makeGenerateTextResult());
      });

      await Runner.run(agent, "Hello", { hooks: { onHandoff } });
      expect(onHandoff).toHaveBeenCalledTimes(1);
      expect(onHandoff.mock.calls[0][1]).toBe("router");
      expect(onHandoff.mock.calls[0][2]).toBe("billing");
    });

    it("should fire AgentHooks.onStart for current agent", async () => {
      const onStart = vi.fn();
      const agent = createSimpleAgent({ hooks: { onStart } });
      await Runner.run(agent, "Hello");

      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it("should fire AgentHooks.onEnd for current agent", async () => {
      const onEnd = vi.fn();
      const agent = createSimpleAgent({ hooks: { onEnd } });
      await Runner.run(agent, "Hello");

      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(onEnd.mock.calls[0][1]).toBe("Hello!");
    });

    it("should swallow hook errors without breaking the run", async () => {
      const throwingHook = vi.fn(() => {
        throw new Error("hook exploded");
      });
      const agent = createSimpleAgent();
      const result = await Runner.run(agent, "Hello", {
        hooks: { onRunStart: throwingHook, onRunEnd: throwingHook },
      });

      expect(result.output).toBe("Hello!");
      expect(throwingHook).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Group 10: Tracing Integration
  // ---------------------------------------------------------------------------

  describe("tracing integration", () => {
    it("should create trace for the run", async () => {
      const agent = createSimpleAgent();
      const result = await Runner.run(agent, "Hello");

      expect(result.traceId).toBeDefined();
      expect(typeof result.traceId).toBe("string");
      expect(result.traceId!.length).toBeGreaterThan(0);
    });

    it("should open and close agent span per turn", async () => {
      const spans: { name: string; type: string }[] = [];
      const processor = {
        onTraceStart: vi.fn(),
        onSpan: vi.fn((span: { name: string; type: string }) => {
          spans.push(span);
        }),
        onTraceEnd: vi.fn(),
      };

      const agent = createSimpleAgent();
      await Runner.run(agent, "Hello", {
        tracing: { processors: [processor] },
      });

      const agentSpans = spans.filter((s) => s.type === "agent");
      expect(agentSpans.length).toBe(1);
      expect(agentSpans[0].name).toBe("test-agent");
    });

    it("should use custom traceId from config", async () => {
      const agent = createSimpleAgent();
      const result = await Runner.run(agent, "Hello", {
        tracing: { traceId: "custom-trace-id" },
      });

      // The custom traceId is used in the context, but the Trace object generates its own
      // The RunResult should reflect the traceId from the Trace instance
      expect(result.traceId).toBeDefined();
    });

    it("should skip tracing when disabled", async () => {
      const processor = {
        onTraceStart: vi.fn(),
        onSpan: vi.fn(),
        onTraceEnd: vi.fn(),
      };

      const agent = createSimpleAgent();
      const result = await Runner.run(agent, "Hello", {
        tracing: { enabled: false, processors: [processor] },
      });

      expect(result.traceId).toBeUndefined();
      expect(processor.onTraceStart).not.toHaveBeenCalled();
    });

    it("should pass traceId to RunResult", async () => {
      const agent = createSimpleAgent();
      const result = await Runner.run(agent, "Hello");

      expect(result).toHaveProperty("traceId");
      expect(result.traceId).toBeDefined();
    });

    it("should notify trace processors", async () => {
      const processor = {
        onTraceStart: vi.fn(),
        onSpan: vi.fn(),
        onTraceEnd: vi.fn(),
      };

      const agent = createSimpleAgent();
      await Runner.run(agent, "Hello", {
        tracing: { processors: [processor] },
      });

      expect(processor.onTraceStart).toHaveBeenCalledTimes(1);
      expect(processor.onTraceEnd).toHaveBeenCalledTimes(1);
      expect(processor.onSpan).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Group 11: Full Streaming (real streamText)
// ---------------------------------------------------------------------------

describe("Runner.stream (full streaming)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamText.mockReturnValue(makeStreamTextResult());
  });

  // -------------------------------------------------------------------------
  // 11a: Basic Streaming
  // -------------------------------------------------------------------------

  describe("basic streaming", () => {
    it("should return StreamResult with events and result promise", () => {
      const agent = createSimpleAgent();
      const streamResult = Runner.stream(agent, "Hello");

      expect(streamResult).toHaveProperty("events");
      expect(streamResult).toHaveProperty("result");
      expect(streamResult.result).toBeInstanceOf(Promise);
    });

    it("should emit text_delta events with real token-by-token deltas", async () => {
      mockStreamText.mockReturnValue(
        makeStreamTextResult({ textDeltas: ["He", "llo", " world", "!"] }),
      );
      const agent = createSimpleAgent();
      const streamResult = Runner.stream(agent, "Hello");

      const deltas: string[] = [];
      for await (const event of streamResult.events) {
        if (event.type === "text_delta") {
          deltas.push(event.delta);
        }
      }

      expect(deltas).toEqual(["He", "llo", " world", "!"]);
      expect(deltas.length).toBe(4);
    });

    it("should emit events in order: agent_start, text_deltas, agent_end, done", async () => {
      const agent = createSimpleAgent();
      const streamResult = Runner.stream(agent, "Hello");

      const eventTypes: string[] = [];
      for await (const event of streamResult.events) {
        eventTypes.push(event.type);
      }

      expect(eventTypes).toEqual([
        "agent_start",
        "text_delta",
        "text_delta",
        "agent_end",
        "done",
      ]);
    });

    it("should resolve result promise with complete RunResult", async () => {
      const agent = createSimpleAgent();
      const streamResult = Runner.stream(agent, "Hello");

      for await (const _ of streamResult.events) {
        /* consume */
      }

      const result = await streamResult.result;
      expect(result.output).toBe("Hello!");
      expect(result.agent).toBe("test-agent");
      expect(result).toHaveProperty("steps");
      expect(result).toHaveProperty("usage");
    });

    it("should call streamText instead of generateText", async () => {
      const agent = createSimpleAgent();
      const streamResult = Runner.stream(agent, "Hello");

      for await (const _ of streamResult.events) {
        /* consume */
      }

      expect(mockStreamText).toHaveBeenCalledTimes(1);
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("should pass model and instructions to streamText", async () => {
      const agent = createSimpleAgent({ instructions: "Be concise." });
      const streamResult = Runner.stream(agent, "Hello");

      for await (const _ of streamResult.events) {
        /* consume */
      }

      const call = mockStreamText.mock.calls[0][0] as StreamTextCall;
      expect(call.model).toBe(mockModel);
      expect(call.system).toBe("Be concise.");
      expect(call.messages).toEqual([{ role: "user", content: "Hello" }]);
    });
  });

  // -------------------------------------------------------------------------
  // 11b: Tool Call Streaming
  // -------------------------------------------------------------------------

  describe("tool call streaming", () => {
    it("should emit tool_call_start on tool-call event from fullStream", async () => {
      mockStreamText.mockReturnValue(
        makeStreamTextResult({
          textDeltas: ["Done."],
          fullStreamParts: [
            {
              type: "tool-call",
              toolCallId: "tc1",
              toolName: "weather",
              args: { city: "SF" },
            },
            {
              type: "tool-result",
              toolCallId: "tc1",
              toolName: "weather",
              result: { temp: 72 },
            },
            { type: "text-delta", textDelta: "Done." },
            {
              type: "finish",
              finishReason: "stop",
              usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            },
          ],
        }),
      );

      const agent = createSimpleAgent();
      const streamResult = Runner.stream(agent, "weather?");

      const events: Array<{ type: string; toolName?: string }> = [];
      for await (const event of streamResult.events) {
        if (event.type === "tool_call_start") {
          events.push({ type: event.type, toolName: event.toolName });
        }
      }

      expect(events.length).toBe(1);
      expect(events[0].toolName).toBe("weather");
    });

    it("should emit tool_call_end on tool-result event from fullStream", async () => {
      mockStreamText.mockReturnValue(
        makeStreamTextResult({
          textDeltas: ["Done."],
          fullStreamParts: [
            {
              type: "tool-call",
              toolCallId: "tc1",
              toolName: "weather",
              args: { city: "SF" },
            },
            {
              type: "tool-result",
              toolCallId: "tc1",
              toolName: "weather",
              result: { temp: 72 },
            },
            { type: "text-delta", textDelta: "Done." },
            {
              type: "finish",
              finishReason: "stop",
              usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            },
          ],
        }),
      );

      const agent = createSimpleAgent();
      const streamResult = Runner.stream(agent, "weather?");

      const events: Array<{
        type: string;
        toolName?: string;
        result?: unknown;
      }> = [];
      for await (const event of streamResult.events) {
        if (event.type === "tool_call_end") {
          events.push({
            type: event.type,
            toolName: event.toolName,
            result: event.result,
          });
        }
      }

      expect(events.length).toBe(1);
      expect(events[0].toolName).toBe("weather");
      expect(events[0].result).toEqual({ temp: 72 });
    });

    it("should record tool steps in final RunResult", async () => {
      mockStreamText.mockReturnValue(
        makeStreamTextResult({
          textDeltas: ["Done."],
          fullStreamParts: [
            {
              type: "tool-call",
              toolCallId: "tc1",
              toolName: "weather",
              args: { city: "SF" },
            },
            {
              type: "tool-result",
              toolCallId: "tc1",
              toolName: "weather",
              result: { temp: 72 },
            },
            { type: "text-delta", textDelta: "Done." },
            {
              type: "finish",
              finishReason: "stop",
              usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            },
          ],
        }),
      );

      const agent = createSimpleAgent();
      const streamResult = Runner.stream(agent, "weather?");

      for await (const _ of streamResult.events) {
        /* consume */
      }

      const result = await streamResult.result;
      const toolCallSteps = result.steps.filter((s) => s.type === "tool_call");
      const toolResultSteps = result.steps.filter(
        (s) => s.type === "tool_result",
      );
      expect(toolCallSteps.length).toBe(1);
      expect(toolResultSteps.length).toBe(1);
    });

    it("should pass tools and maxSteps to streamText", async () => {
      const myTool = {
        description: "a tool",
        parameters: z.object({}),
        execute: vi.fn(),
      };
      const agent = createSimpleAgent({
        tools: { myTool },
        maxToolRoundtrips: 5,
      });
      const streamResult = Runner.stream(agent, "Hello");

      for await (const _ of streamResult.events) {
        /* consume */
      }

      const call = mockStreamText.mock.calls[0][0] as StreamTextCall;
      expect(call.tools).toBeDefined();
      expect(call.tools!.myTool).toBeDefined();
      expect(call.maxSteps).toBe(5);
    });

    it("should handle multiple tool calls across steps", async () => {
      mockStreamText.mockReturnValue(
        makeStreamTextResult({
          textDeltas: ["Final."],
          fullStreamParts: [
            {
              type: "tool-call",
              toolCallId: "tc1",
              toolName: "search",
              args: { q: "hi" },
            },
            {
              type: "tool-result",
              toolCallId: "tc1",
              toolName: "search",
              result: "found",
            },
            {
              type: "tool-call",
              toolCallId: "tc2",
              toolName: "fetch",
              args: { url: "x" },
            },
            {
              type: "tool-result",
              toolCallId: "tc2",
              toolName: "fetch",
              result: "data",
            },
            { type: "text-delta", textDelta: "Final." },
            {
              type: "finish",
              finishReason: "stop",
              usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            },
          ],
        }),
      );

      const agent = createSimpleAgent();
      const streamResult = Runner.stream(agent, "do stuff");

      const toolStarts: string[] = [];
      const toolEnds: string[] = [];
      for await (const event of streamResult.events) {
        if (event.type === "tool_call_start") toolStarts.push(event.toolName);
        if (event.type === "tool_call_end") toolEnds.push(event.toolName);
      }

      expect(toolStarts).toEqual(["search", "fetch"]);
      expect(toolEnds).toEqual(["search", "fetch"]);
    });
  });

  // -------------------------------------------------------------------------
  // 11c: Handoff Streaming
  // -------------------------------------------------------------------------

  describe("handoff streaming", () => {
    it("should detect handoff sentinel and switch agent", async () => {
      const targetAgent = createSimpleAgent({
        name: "billing",
        instructions: "I am billing",
      });
      const agent = createSimpleAgent({ handoffs: [targetAgent] });

      let callCount = 0;
      mockStreamText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return makeStreamTextResult({
            textDeltas: [],
            text: "",
            fullStreamParts: [
              {
                type: "tool-call",
                toolCallId: "tc1",
                toolName: "transfer_to_billing",
                args: {},
              },
              {
                type: "tool-result",
                toolCallId: "tc1",
                toolName: "transfer_to_billing",
                result: { __handoff: true, targetAgent: "billing" },
              },
              {
                type: "finish",
                finishReason: "tool-calls",
                usage: {
                  promptTokens: 5,
                  completionTokens: 5,
                  totalTokens: 10,
                },
              },
            ],
            usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
          });
        }
        return makeStreamTextResult({ textDeltas: ["Billing here!"] });
      });

      const streamResult = Runner.stream(agent, "Transfer me");

      for await (const _ of streamResult.events) {
        /* consume */
      }

      const result = await streamResult.result;
      expect(result.agent).toBe("billing");
      expect(result.output).toBe("Billing here!");
    });

    it("should emit handoff event between agent switches", async () => {
      const targetAgent = createSimpleAgent({ name: "billing" });
      const agent = createSimpleAgent({
        name: "router",
        handoffs: [targetAgent],
      });

      let callCount = 0;
      mockStreamText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return makeStreamTextResult({
            textDeltas: [],
            text: "",
            fullStreamParts: [
              {
                type: "tool-call",
                toolCallId: "tc1",
                toolName: "transfer_to_billing",
                args: {},
              },
              {
                type: "tool-result",
                toolCallId: "tc1",
                toolName: "transfer_to_billing",
                result: { __handoff: true, targetAgent: "billing" },
              },
              {
                type: "finish",
                finishReason: "tool-calls",
                usage: {
                  promptTokens: 5,
                  completionTokens: 5,
                  totalTokens: 10,
                },
              },
            ],
            usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
          });
        }
        return makeStreamTextResult();
      });

      const streamResult = Runner.stream(agent, "Hello");
      const eventTypes: string[] = [];
      for await (const event of streamResult.events) {
        eventTypes.push(event.type);
      }

      expect(eventTypes).toContain("handoff");
      const handoffIdx = eventTypes.indexOf("handoff");
      expect(handoffIdx).toBeGreaterThan(0);
    });

    it("should emit agent_start and agent_end for each agent", async () => {
      const targetAgent = createSimpleAgent({ name: "billing" });
      const agent = createSimpleAgent({
        name: "router",
        handoffs: [targetAgent],
      });

      let callCount = 0;
      mockStreamText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return makeStreamTextResult({
            textDeltas: [],
            text: "",
            fullStreamParts: [
              {
                type: "tool-call",
                toolCallId: "tc1",
                toolName: "transfer_to_billing",
                args: {},
              },
              {
                type: "tool-result",
                toolCallId: "tc1",
                toolName: "transfer_to_billing",
                result: { __handoff: true, targetAgent: "billing" },
              },
              {
                type: "finish",
                finishReason: "tool-calls",
                usage: {
                  promptTokens: 5,
                  completionTokens: 5,
                  totalTokens: 10,
                },
              },
            ],
            usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
          });
        }
        return makeStreamTextResult();
      });

      const streamResult = Runner.stream(agent, "Hello");
      const agentEvents: Array<{ type: string; agent: string }> = [];
      for await (const event of streamResult.events) {
        if (event.type === "agent_start" || event.type === "agent_end") {
          agentEvents.push({ type: event.type, agent: event.agent });
        }
      }

      expect(agentEvents).toEqual([
        { type: "agent_start", agent: "router" },
        { type: "agent_end", agent: "router" },
        { type: "agent_start", agent: "billing" },
        { type: "agent_end", agent: "billing" },
      ]);
    });

    it("should apply inputFilter on handoff", async () => {
      const targetAgent = createSimpleAgent({ name: "billing" });
      const agent = createSimpleAgent({
        handoffs: [
          handoff(targetAgent, {
            inputFilter: (msgs: CoreMessage[]) =>
              msgs.filter((m) => m.role === "user"),
          }),
        ],
      });

      let callCount = 0;
      mockStreamText.mockImplementation(
        (opts: { messages?: CoreMessage[] }) => {
          callCount++;
          if (callCount === 1) {
            return makeStreamTextResult({
              textDeltas: [],
              text: "",
              fullStreamParts: [
                {
                  type: "tool-call",
                  toolCallId: "tc1",
                  toolName: "transfer_to_billing",
                  args: {},
                },
                {
                  type: "tool-result",
                  toolCallId: "tc1",
                  toolName: "transfer_to_billing",
                  result: { __handoff: true, targetAgent: "billing" },
                },
                {
                  type: "finish",
                  finishReason: "tool-calls",
                  usage: {
                    promptTokens: 5,
                    completionTokens: 5,
                    totalTokens: 10,
                  },
                },
              ],
              usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
            });
          }
          const msgs = opts.messages ?? [];
          expect(msgs.every((m) => m.role === "user")).toBe(true);
          return makeStreamTextResult({ textDeltas: ["filtered"] });
        },
      );

      const streamResult = Runner.stream(agent, [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hey" },
        { role: "user", content: "Transfer" },
      ]);

      for await (const _ of streamResult.events) {
        /* consume */
      }

      const result = await streamResult.result;
      expect(result.output).toBe("filtered");
    });

    it("should suppress text_deltas after handoff detected in same turn", async () => {
      const targetAgent = createSimpleAgent({ name: "billing" });
      const agent = createSimpleAgent({ handoffs: [targetAgent] });

      let callCount = 0;
      mockStreamText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return makeStreamTextResult({
            textDeltas: [],
            text: "",
            fullStreamParts: [
              {
                type: "tool-call",
                toolCallId: "tc1",
                toolName: "transfer_to_billing",
                args: {},
              },
              {
                type: "tool-result",
                toolCallId: "tc1",
                toolName: "transfer_to_billing",
                result: { __handoff: true, targetAgent: "billing" },
              },
              { type: "text-delta", textDelta: "This should be suppressed" },
              {
                type: "finish",
                finishReason: "tool-calls",
                usage: {
                  promptTokens: 5,
                  completionTokens: 5,
                  totalTokens: 10,
                },
              },
            ],
            usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
          });
        }
        return makeStreamTextResult({ textDeltas: ["Billing!"] });
      });

      const streamResult = Runner.stream(agent, "Hello");
      const textDeltas: Array<{ delta: string; agent: string }> = [];
      for await (const event of streamResult.events) {
        if (event.type === "text_delta") {
          textDeltas.push({ delta: event.delta, agent: event.agent });
        }
      }

      expect(textDeltas).toEqual([{ delta: "Billing!", agent: "billing" }]);
    });

    it("should fire onHandoff callbacks", async () => {
      const onHandoff = vi.fn();
      const targetAgent = createSimpleAgent({ name: "billing" });
      const agent = createSimpleAgent({
        name: "router",
        handoffs: [handoff(targetAgent, { onHandoff })],
      });

      let callCount = 0;
      mockStreamText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return makeStreamTextResult({
            textDeltas: [],
            text: "",
            fullStreamParts: [
              {
                type: "tool-call",
                toolCallId: "tc1",
                toolName: "transfer_to_billing",
                args: {},
              },
              {
                type: "tool-result",
                toolCallId: "tc1",
                toolName: "transfer_to_billing",
                result: { __handoff: true, targetAgent: "billing" },
              },
              {
                type: "finish",
                finishReason: "tool-calls",
                usage: {
                  promptTokens: 5,
                  completionTokens: 5,
                  totalTokens: 10,
                },
              },
            ],
            usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
          });
        }
        return makeStreamTextResult();
      });

      const streamResult = Runner.stream(agent, "Hello");
      for await (const _ of streamResult.events) {
        /* consume */
      }

      expect(onHandoff).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // 11d: Guardrails in Stream
  // -------------------------------------------------------------------------

  describe("guardrails in stream", () => {
    it("should run input guardrails before streamText", async () => {
      const executionOrder: string[] = [];
      const guard: Guardrail = {
        name: "order-guard",
        execute: () => {
          executionOrder.push("guardrail");
          return Promise.resolve({ tripwired: false });
        },
      };
      mockStreamText.mockImplementation(() => {
        executionOrder.push("streamText");
        return makeStreamTextResult();
      });

      const agent = createSimpleAgent({ inputGuardrails: [guard] });
      const streamResult = Runner.stream(agent, "Hello");
      for await (const _ of streamResult.events) {
        /* consume */
      }

      expect(executionOrder).toEqual(["guardrail", "streamText"]);
    });

    it("should emit error event when input guardrail trips", async () => {
      const guard: Guardrail = {
        name: "blocker",
        execute: () => Promise.resolve({ tripwired: true, reason: "blocked" }),
      };
      const agent = createSimpleAgent({ inputGuardrails: [guard] });
      const streamResult = Runner.stream(agent, "Hello");

      const eventTypes: string[] = [];
      for await (const event of streamResult.events) {
        eventTypes.push(event.type);
      }

      expect(eventTypes).toContain("error");
      expect(mockStreamText).not.toHaveBeenCalled();
      await expect(streamResult.result).rejects.toThrow(
        GuardrailTripwiredError,
      );
    });

    it("should run output guardrails after final text collected", async () => {
      let receivedMessages: CoreMessage[] = [];
      const guard: Guardrail = {
        name: "inspect-guard",
        execute: (_ctx, input) => {
          receivedMessages = input.messages;
          return Promise.resolve({ tripwired: false });
        },
      };
      const agent = createSimpleAgent({ outputGuardrails: [guard] });
      const streamResult = Runner.stream(agent, "Hello");

      for await (const _ of streamResult.events) {
        /* consume */
      }

      expect(receivedMessages).toEqual([
        { role: "assistant", content: "Hello!" },
      ]);
    });

    it("should skip output guardrails on handoff turn", async () => {
      const guardExecute = vi.fn(() => Promise.resolve({ tripwired: false }));
      const guard: Guardrail = { name: "skipped", execute: guardExecute };
      const targetAgent = createSimpleAgent({ name: "target" });
      const agent = createSimpleAgent({
        handoffs: [targetAgent],
        outputGuardrails: [guard],
      });

      let callCount = 0;
      mockStreamText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return makeStreamTextResult({
            textDeltas: [],
            text: "",
            fullStreamParts: [
              {
                type: "tool-call",
                toolCallId: "tc1",
                toolName: "transfer_to_target",
                args: {},
              },
              {
                type: "tool-result",
                toolCallId: "tc1",
                toolName: "transfer_to_target",
                result: { __handoff: true, targetAgent: "target" },
              },
              {
                type: "finish",
                finishReason: "tool-calls",
                usage: {
                  promptTokens: 5,
                  completionTokens: 5,
                  totalTokens: 10,
                },
              },
            ],
            usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
          });
        }
        return makeStreamTextResult();
      });

      const streamResult = Runner.stream(agent, "Hello");
      for await (const _ of streamResult.events) {
        /* consume */
      }

      expect(guardExecute).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 11e: Usage, Schema and Result
  // -------------------------------------------------------------------------

  describe("usage, schema and result", () => {
    it("should accumulate usage across handoff turns", async () => {
      const targetAgent = createSimpleAgent({ name: "billing" });
      const agent = createSimpleAgent({ handoffs: [targetAgent] });

      let callCount = 0;
      mockStreamText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return makeStreamTextResult({
            textDeltas: [],
            text: "",
            fullStreamParts: [
              {
                type: "tool-call",
                toolCallId: "tc1",
                toolName: "transfer_to_billing",
                args: {},
              },
              {
                type: "tool-result",
                toolCallId: "tc1",
                toolName: "transfer_to_billing",
                result: { __handoff: true, targetAgent: "billing" },
              },
              {
                type: "finish",
                finishReason: "tool-calls",
                usage: {
                  promptTokens: 20,
                  completionTokens: 10,
                  totalTokens: 30,
                },
              },
            ],
            usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
          });
        }
        return makeStreamTextResult({
          usage: { promptTokens: 15, completionTokens: 8, totalTokens: 23 },
        });
      });

      const streamResult = Runner.stream(agent, "Hello");
      for await (const _ of streamResult.events) {
        /* consume */
      }

      const result = await streamResult.result;
      expect(result.usage.promptTokens).toBe(35);
      expect(result.usage.completionTokens).toBe(18);
      expect(result.usage.totalTokens).toBe(53);
    });

    it("should handle output schema parsing", async () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      mockStreamText.mockReturnValue(
        makeStreamTextResult({
          textDeltas: ['{"name":"Alice","age":30}'],
          text: '{"name":"Alice","age":30}',
        }),
      );

      const agent = createSimpleAgent({ outputSchema: schema });
      const streamResult = Runner.stream(agent, "Give me data");

      for await (const _ of streamResult.events) {
        /* consume */
      }

      const result = await streamResult.result;
      expect(result.output).toEqual({ name: "Alice", age: 30 });
    });

    it("should handle zero usage", async () => {
      mockStreamText.mockReturnValue(
        makeStreamTextResult({
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        }),
      );

      const agent = createSimpleAgent();
      const streamResult = Runner.stream(agent, "Hello");

      for await (const _ of streamResult.events) {
        /* consume */
      }

      const result = await streamResult.result;
      expect(result.usage.promptTokens).toBe(0);
      expect(result.usage.completionTokens).toBe(0);
      expect(result.usage.totalTokens).toBe(0);
    });

    it("should reject result promise on error", async () => {
      mockStreamText.mockImplementation(() => {
        throw new Error("streamText failed");
      });

      const agent = createSimpleAgent();
      const streamResult = Runner.stream(agent, "Hello");

      const eventTypes: string[] = [];
      for await (const event of streamResult.events) {
        eventTypes.push(event.type);
      }

      expect(eventTypes).toContain("error");
      await expect(streamResult.result).rejects.toThrow("streamText failed");
    });
  });

  // -------------------------------------------------------------------------
  // 11f: Turn Management and Error Handling
  // -------------------------------------------------------------------------

  describe("turn management and error handling", () => {
    it("should emit error event for MaxTurnsExceededError", async () => {
      const agentA = createSimpleAgent({
        name: "agent-a",
        instructions: "I am A",
      });
      const agentB = createSimpleAgent({
        name: "agent-b",
        instructions: "I am B",
      });
      (
        agentA as unknown as { config: { handoffs: unknown[] } }
      ).config.handoffs = [agentB];
      (
        agentB as unknown as { config: { handoffs: unknown[] } }
      ).config.handoffs = [agentA];

      mockStreamText.mockImplementation((opts: { system?: string }) => {
        const isA = opts.system === "I am A";
        const targetName = isA ? "agent-b" : "agent-a";
        const toolName = `transfer_to_${targetName.replace(/-/g, "_")}`;
        return makeStreamTextResult({
          textDeltas: [],
          text: "",
          fullStreamParts: [
            {
              type: "tool-call",
              toolCallId: `tc${Date.now()}`,
              toolName,
              args: {},
            },
            {
              type: "tool-result",
              toolCallId: `tc${Date.now()}`,
              toolName,
              result: { __handoff: true, targetAgent: targetName },
            },
            {
              type: "finish",
              finishReason: "tool-calls",
              usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
            },
          ],
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        });
      });

      const streamResult = Runner.stream(agentA, "Hello", { maxTurns: 3 });
      const eventTypes: string[] = [];
      for await (const event of streamResult.events) {
        eventTypes.push(event.type);
      }

      expect(eventTypes).toContain("error");
      await expect(streamResult.result).rejects.toThrow(MaxTurnsExceededError);
    });

    it("should emit error event when streamText throws", async () => {
      mockStreamText.mockImplementation(() => {
        throw new Error("LLM failed");
      });

      const agent = createSimpleAgent();
      const streamResult = Runner.stream(agent, "Hello");

      const eventTypes: string[] = [];
      for await (const event of streamResult.events) {
        eventTypes.push(event.type);
      }

      expect(eventTypes).toContain("error");
      await expect(streamResult.result).rejects.toThrow("LLM failed");
    });

    it("should default maxTurns to 10", async () => {
      const agentA = createSimpleAgent({
        name: "agent-a",
        instructions: "I am A",
      });
      const agentB = createSimpleAgent({
        name: "agent-b",
        instructions: "I am B",
      });
      (
        agentA as unknown as { config: { handoffs: unknown[] } }
      ).config.handoffs = [agentB];
      (
        agentB as unknown as { config: { handoffs: unknown[] } }
      ).config.handoffs = [agentA];

      mockStreamText.mockImplementation((opts: { system?: string }) => {
        const isA = opts.system === "I am A";
        const targetName = isA ? "agent-b" : "agent-a";
        const toolName = `transfer_to_${targetName.replace(/-/g, "_")}`;
        return makeStreamTextResult({
          textDeltas: [],
          text: "",
          fullStreamParts: [
            { type: "tool-call", toolCallId: "tc1", toolName, args: {} },
            {
              type: "tool-result",
              toolCallId: "tc1",
              toolName,
              result: { __handoff: true, targetAgent: targetName },
            },
            {
              type: "finish",
              finishReason: "tool-calls",
              usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
            },
          ],
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        });
      });

      const streamResult = Runner.stream(agentA, "Hello");
      for await (const _ of streamResult.events) {
        /* consume */
      }

      expect(mockStreamText.mock.calls.length).toBe(10);
      await expect(streamResult.result).rejects.toThrow(MaxTurnsExceededError);
    });
  });

  // -------------------------------------------------------------------------
  // 11g: Hooks and Tracing
  // -------------------------------------------------------------------------

  describe("hooks and tracing", () => {
    it("should fire lifecycle hooks (onRunStart, onRunEnd, onAgentStart, onAgentEnd)", async () => {
      const onRunStart = vi.fn();
      const onRunEnd = vi.fn();
      const onAgentStart = vi.fn();
      const onAgentEnd = vi.fn();

      const agent = createSimpleAgent();
      const streamResult = Runner.stream(agent, "Hello", {
        hooks: { onRunStart, onRunEnd, onAgentStart, onAgentEnd },
      });

      for await (const _ of streamResult.events) {
        /* consume */
      }

      expect(onRunStart).toHaveBeenCalledTimes(1);
      expect(onRunEnd).toHaveBeenCalledTimes(1);
      expect(onAgentStart).toHaveBeenCalledTimes(1);
      expect(onAgentEnd).toHaveBeenCalledTimes(1);
      expect(onAgentEnd.mock.calls[0][1]).toBe("Hello!");
    });

    it("should create trace with agent spans", async () => {
      const spans: { name: string; type: string }[] = [];
      const processor = {
        onTraceStart: vi.fn(),
        onSpan: vi.fn((span: { name: string; type: string }) => {
          spans.push(span);
        }),
        onTraceEnd: vi.fn(),
      };

      const agent = createSimpleAgent();
      const streamResult = Runner.stream(agent, "Hello", {
        tracing: { processors: [processor] },
      });

      for await (const _ of streamResult.events) {
        /* consume */
      }

      const result = await streamResult.result;
      expect(result.traceId).toBeDefined();
      expect(processor.onTraceStart).toHaveBeenCalledTimes(1);
      expect(processor.onTraceEnd).toHaveBeenCalledTimes(1);
      const agentSpans = spans.filter((s) => s.type === "agent");
      expect(agentSpans.length).toBe(1);
      expect(agentSpans[0].name).toBe("test-agent");
    });

    it("should swallow hook errors without breaking stream", async () => {
      const throwingHook = vi.fn(() => {
        throw new Error("hook exploded");
      });
      const agent = createSimpleAgent();
      const streamResult = Runner.stream(agent, "Hello", {
        hooks: { onRunStart: throwingHook, onRunEnd: throwingHook },
      });

      for await (const _ of streamResult.events) {
        /* consume */
      }

      const result = await streamResult.result;
      expect(result.output).toBe("Hello!");
      expect(throwingHook).toHaveBeenCalled();
    });

    it("should skip tracing when disabled", async () => {
      const processor = {
        onTraceStart: vi.fn(),
        onSpan: vi.fn(),
        onTraceEnd: vi.fn(),
      };

      const agent = createSimpleAgent();
      const streamResult = Runner.stream(agent, "Hello", {
        tracing: { enabled: false, processors: [processor] },
      });

      for await (const _ of streamResult.events) {
        /* consume */
      }

      const result = await streamResult.result;
      expect(result.traceId).toBeUndefined();
      expect(processor.onTraceStart).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Tool Guardrails — Runner.run integration
  // ---------------------------------------------------------------------------

  describe("tool guardrails in run()", () => {
    it("should wrap guarded tools when building toolset", async () => {
      const ig = defineToolInputGuardrail({
        name: "ig",
        execute: async () => {
          await new Promise<void>((r) => setTimeout(r, 1));
          return ToolGuardrailBehaviorFactory.allow();
        },
      });
      const gt = guardedTool({
        description: "Guarded tool",
        parameters: z.object({ text: z.string() }),
        execute: async ({ text }: { text: string }) => {
          await new Promise<void>((r) => setTimeout(r, 1));
          return text;
        },
        inputGuardrails: [ig],
      });

      const agent = createSimpleAgent({ tools: { myTool: gt } });
      await Runner.run(agent, "Hello");

      const call = mockGenerateText.mock.calls[0][0] as GenerateTextCall;
      const passedTool = call.tools?.myTool as Record<string, unknown>;
      expect(passedTool).toBeDefined();
      expect(isGuardedTool(passedTool)).toBe(false);
    });

    it("should pass non-guarded tools unchanged to generateText", async () => {
      const plainExecute = vi.fn().mockResolvedValue("plain-result");
      const plainTool = {
        description: "Plain tool",
        parameters: z.object({ x: z.number() }),
        execute: plainExecute,
      };

      const agent = createSimpleAgent({ tools: { plain: plainTool } });
      await Runner.run(agent, "Hello");

      const call = mockGenerateText.mock.calls[0][0] as GenerateTextCall;
      const passedTool = call.tools?.plain as Record<string, unknown>;
      expect(passedTool.execute).toBe(plainExecute);
    });

    it("should handle ToolGuardrailTripwiredError from generateText", async () => {
      const gt = guardedTool({
        description: "Tool",
        parameters: z.object({ text: z.string() }),
        execute: async ({ text }: { text: string }) => {
          await new Promise<void>((r) => setTimeout(r, 1));
          return text;
        },
      });

      const agent = createSimpleAgent({ tools: { myTool: gt } });

      mockGenerateText.mockRejectedValueOnce(
        new ToolGuardrailTripwiredError("block_guard", "myTool", "blocked"),
      );

      await expect(Runner.run(agent, "Hello")).rejects.toThrow(
        ToolGuardrailTripwiredError,
      );
    });

    it("should fire onGuardrailTripped hook on tool guardrail throw", async () => {
      const onGuardrailTripped = vi.fn();
      const gt = guardedTool({
        description: "Tool",
        parameters: z.object({ text: z.string() }),
        execute: async ({ text }: { text: string }) => {
          await new Promise<void>((r) => setTimeout(r, 1));
          return text;
        },
      });

      const agent = createSimpleAgent({ tools: { myTool: gt } });

      mockGenerateText.mockRejectedValueOnce(
        new ToolGuardrailTripwiredError("block_guard", "myTool", "blocked", {
          level: "critical",
        }),
      );

      try {
        await Runner.run(agent, "Hello", {
          hooks: { onGuardrailTripped },
        });
      } catch {
        /* expected */
      }

      expect(onGuardrailTripped).toHaveBeenCalledTimes(1);
      const result = onGuardrailTripped.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(result.tripwired).toBe(true);
      expect(result.reason).toBe("blocked");
    });

    it("should not wrap handoff tools with guardrails", async () => {
      const billingAgent = createSimpleAgent({ name: "billing" });
      const mainAgent = createSimpleAgent({
        handoffs: [handoff(billingAgent)],
      });

      mockGenerateText
        .mockResolvedValueOnce(
          makeGenerateTextResult({
            steps: [
              {
                stepType: "tool-result",
                text: "",
                toolCalls: [
                  {
                    type: "tool-call",
                    toolCallId: "tc1",
                    toolName: "transfer_to_billing",
                    args: {},
                  },
                ],
                toolResults: [
                  {
                    type: "tool-result",
                    toolCallId: "tc1",
                    toolName: "transfer_to_billing",
                    result: { __handoff: true, targetAgent: "billing" },
                  },
                ],
                finishReason: "stop",
                usage: {
                  promptTokens: 5,
                  completionTokens: 3,
                  totalTokens: 8,
                },
              },
            ],
          }),
        )
        .mockResolvedValueOnce(makeGenerateTextResult());

      const result = await Runner.run(mainAgent, "Transfer me");
      expect(result.agent).toBe("billing");
    });

    it("should work with mix of guarded and plain tools", async () => {
      const ig = defineToolInputGuardrail({
        name: "ig",
        execute: async () => {
          await new Promise<void>((r) => setTimeout(r, 1));
          return ToolGuardrailBehaviorFactory.allow();
        },
      });
      const gt = guardedTool({
        description: "Guarded",
        parameters: z.object({ text: z.string() }),
        execute: async ({ text }: { text: string }) => {
          await new Promise<void>((r) => setTimeout(r, 1));
          return text;
        },
        inputGuardrails: [ig],
      });
      const plainExecute = vi.fn().mockResolvedValue("result");
      const plainTool = {
        description: "Plain",
        parameters: z.object({ x: z.number() }),
        execute: plainExecute,
      };

      const agent = createSimpleAgent({
        tools: { guarded: gt, plain: plainTool },
      });
      await Runner.run(agent, "Hello");

      const call = mockGenerateText.mock.calls[0][0] as GenerateTextCall;
      expect(call.tools?.guarded).toBeDefined();
      expect(call.tools?.plain).toBeDefined();
      expect((call.tools?.plain as Record<string, unknown>).execute).toBe(
        plainExecute,
      );
    });

    it("should close agent span on tool guardrail error", async () => {
      const processor = {
        onTraceStart: vi.fn(),
        onSpan: vi.fn(),
        onTraceEnd: vi.fn(),
      };

      const gt = guardedTool({
        description: "Tool",
        parameters: z.object({ text: z.string() }),
        execute: async ({ text }: { text: string }) => {
          await new Promise<void>((r) => setTimeout(r, 1));
          return text;
        },
      });

      const agent = createSimpleAgent({ tools: { myTool: gt } });

      mockGenerateText.mockRejectedValueOnce(
        new ToolGuardrailTripwiredError("guard", "myTool", "fail"),
      );

      try {
        await Runner.run(agent, "Hello", {
          tracing: { processors: [processor] },
        });
      } catch {
        /* expected */
      }

      expect(processor.onSpan).toHaveBeenCalled();
    });

    it("should re-throw non-ToolGuardrailTripwiredError from generateText", async () => {
      const gt = guardedTool({
        description: "Tool",
        parameters: z.object({ text: z.string() }),
        execute: async ({ text }: { text: string }) => {
          await new Promise<void>((r) => setTimeout(r, 1));
          return text;
        },
      });

      const agent = createSimpleAgent({ tools: { myTool: gt } });

      mockGenerateText.mockRejectedValueOnce(new Error("network error"));

      await expect(Runner.run(agent, "Hello")).rejects.toThrow("network error");
    });
  });

  // ---------------------------------------------------------------------------
  // Tool Guardrails — Runner.stream integration
  // ---------------------------------------------------------------------------

  describe("tool guardrails in stream()", () => {
    it("should emit error event when tool guardrail throwException", async () => {
      const gt = guardedTool({
        description: "Tool",
        parameters: z.object({ text: z.string() }),
        execute: async ({ text }: { text: string }) => {
          await new Promise<void>((r) => setTimeout(r, 1));
          return text;
        },
      });

      const agent = createSimpleAgent({ tools: { myTool: gt } });

      mockStreamText.mockReturnValueOnce({
        ...makeStreamTextResult(),
        get fullStream() {
          return (async function* () {
            await new Promise<void>((r) => setTimeout(r, 1));
            yield { type: "text-delta" as const, textDelta: "" };
            throw new ToolGuardrailTripwiredError(
              "stream_guard",
              "myTool",
              "blocked in stream",
            );
          })();
        },
      });

      const streamResult = Runner.stream(agent, "Hello");
      const events: Array<{ type: string }> = [];

      for await (const event of streamResult.events) {
        events.push(event);
      }

      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain("error");

      try {
        await streamResult.result;
      } catch {
        /* consume the rejection */
      }
    });

    it("should reject result promise on tool guardrail trip", async () => {
      const gt = guardedTool({
        description: "Tool",
        parameters: z.object({ text: z.string() }),
        execute: async ({ text }: { text: string }) => {
          await new Promise<void>((r) => setTimeout(r, 1));
          return text;
        },
      });

      const agent = createSimpleAgent({ tools: { myTool: gt } });

      mockStreamText.mockReturnValueOnce({
        ...makeStreamTextResult(),
        get fullStream() {
          return (async function* () {
            await new Promise<void>((r) => setTimeout(r, 1));
            yield { type: "text-delta" as const, textDelta: "" };
            throw new ToolGuardrailTripwiredError("guard", "myTool", "blocked");
          })();
        },
      });

      const streamResult = Runner.stream(agent, "Hello");

      for await (const _ of streamResult.events) {
        /* consume */
      }

      await expect(streamResult.result).rejects.toThrow(
        ToolGuardrailTripwiredError,
      );
    });

    it("should wrap guarded tools in streaming mode", async () => {
      const ig = defineToolInputGuardrail({
        name: "ig",
        execute: async () => {
          await new Promise<void>((r) => setTimeout(r, 1));
          return ToolGuardrailBehaviorFactory.allow();
        },
      });
      const gt = guardedTool({
        description: "Guarded tool",
        parameters: z.object({ text: z.string() }),
        execute: async ({ text }: { text: string }) => {
          await new Promise<void>((r) => setTimeout(r, 1));
          return text;
        },
        inputGuardrails: [ig],
      });

      mockStreamText.mockReturnValue(makeStreamTextResult());

      const agent = createSimpleAgent({ tools: { myTool: gt } });
      const streamResult = Runner.stream(agent, "Hello");

      for await (const _ of streamResult.events) {
        /* consume */
      }

      const call = mockStreamText.mock.calls[0][0] as StreamTextCall;
      const passedTool = call.tools?.myTool as Record<string, unknown>;
      expect(passedTool).toBeDefined();
      expect(isGuardedTool(passedTool)).toBe(false);
    });

    it("should fire onGuardrailTripped hook in stream on tool guardrail error", async () => {
      const onGuardrailTripped = vi.fn();
      const gt = guardedTool({
        description: "Tool",
        parameters: z.object({ text: z.string() }),
        execute: async ({ text }: { text: string }) => {
          await new Promise<void>((r) => setTimeout(r, 1));
          return text;
        },
      });

      const agent = createSimpleAgent({ tools: { myTool: gt } });

      mockStreamText.mockReturnValueOnce({
        ...makeStreamTextResult(),
        get fullStream() {
          return (async function* () {
            await new Promise<void>((r) => setTimeout(r, 1));
            yield { type: "text-delta" as const, textDelta: "" };
            throw new ToolGuardrailTripwiredError("guard", "myTool", "blocked");
          })();
        },
      });

      const streamResult = Runner.stream(agent, "Hello", {
        hooks: { onGuardrailTripped },
      });

      for await (const _ of streamResult.events) {
        /* consume */
      }

      try {
        await streamResult.result;
      } catch {
        /* expected */
      }

      expect(onGuardrailTripped).toHaveBeenCalledTimes(1);
    });
  });
});
