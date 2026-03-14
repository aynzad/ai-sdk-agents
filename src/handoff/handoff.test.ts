import { describe, it, expect, vi } from "vitest";
import type { LanguageModelV1, CoreMessage } from "ai";
import type { HandoffConfig } from "@/types";
import { Agent } from "@/agent/agent";
import {
  handoff,
  normalizeHandoff,
  handoffToTool,
  isHandoffResult,
  handoffFilters,
} from "./handoff";

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

const mockModel = createMockModel();

function createMockAgent(name: string) {
  return new Agent({
    name,
    instructions: `You are ${name}.`,
    model: mockModel,
  });
}

// ---------------------------------------------------------------------------
// Sample messages for filter tests
// ---------------------------------------------------------------------------

const sampleMessages: CoreMessage[] = [
  { role: "system", content: "You are helpful." },
  { role: "user", content: "Hello" },
  { role: "assistant", content: "Hi there!" },
  {
    role: "assistant",
    content: [
      {
        type: "tool-call",
        toolCallId: "tc1",
        toolName: "search",
        args: { q: "test" },
      },
    ],
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "tc1",
        toolName: "search",
        result: "found",
      },
    ],
  },
  { role: "user", content: "Thanks" },
  { role: "assistant", content: "You are welcome!" },
];

// ---------------------------------------------------------------------------
// handoff()
// ---------------------------------------------------------------------------

describe("handoff", () => {
  it("should create a HandoffConfig from an agent", () => {
    const agent = createMockAgent("billing");
    const config = handoff(agent);

    expect(config).toBeDefined();
    expect(config.agent).toBe(agent);
  });

  it("should set toolName override when provided", () => {
    const agent = createMockAgent("billing");
    const config = handoff(agent, { toolName: "route_to_billing" });

    expect(config.toolName).toBe("route_to_billing");
  });

  it("should set toolDescription override when provided", () => {
    const agent = createMockAgent("billing");
    const config = handoff(agent, {
      toolDescription: "Transfers to the billing department",
    });

    expect(config.toolDescription).toBe("Transfers to the billing department");
  });

  it("should set onHandoff callback when provided", () => {
    const agent = createMockAgent("billing");
    const callback = vi.fn();
    const config = handoff(agent, { onHandoff: callback });

    expect(config.onHandoff).toBe(callback);
  });

  it("should set inputFilter when provided", () => {
    const agent = createMockAgent("billing");
    const filter = (msgs: CoreMessage[]) => msgs.slice(-1);
    const config = handoff(agent, { inputFilter: filter });

    expect(config.inputFilter).toBe(filter);
  });

  it("should use agent reference from the passed agent instance", () => {
    const agent = createMockAgent("support");
    const config = handoff(agent);

    expect(config.agent.name).toBe("support");
    expect(config.agent).toBe(agent);
  });
});

// ---------------------------------------------------------------------------
// normalizeHandoff()
// ---------------------------------------------------------------------------

describe("normalizeHandoff", () => {
  it("should return HandoffConfig unchanged when given a HandoffConfig", () => {
    const agent = createMockAgent("billing");
    const config: HandoffConfig = {
      agent,
      toolName: "custom_tool",
    };

    const result = normalizeHandoff(config);

    expect(result).toBe(config);
    expect(result.toolName).toBe("custom_tool");
  });

  it("should wrap AgentInstance in HandoffConfig with defaults", () => {
    const agent = createMockAgent("billing");
    const result = normalizeHandoff(agent);

    expect(result.agent).toBe(agent);
    expect(result.toolName).toBeUndefined();
    expect(result.toolDescription).toBeUndefined();
    expect(result.onHandoff).toBeUndefined();
    expect(result.inputFilter).toBeUndefined();
  });

  it("should detect AgentInstance by checking for name and config properties", () => {
    const agent = createMockAgent("billing");

    const fromAgent = normalizeHandoff(agent);
    expect(fromAgent.agent).toBe(agent);

    const config: HandoffConfig = { agent };
    const fromConfig = normalizeHandoff(config);
    expect(fromConfig).toBe(config);
  });
});

// ---------------------------------------------------------------------------
// handoffToTool()
// ---------------------------------------------------------------------------

describe("handoffToTool", () => {
  it('should produce a tool with name pattern "transfer_to_{agent_name}"', () => {
    const agent = createMockAgent("billing");
    const result = handoffToTool(agent);

    expect(result.toolName).toBe("transfer_to_billing");
  });

  it("should return tool, config, and toolName", () => {
    const agent = createMockAgent("billing");
    const { tool, config, toolName } = handoffToTool(agent);

    expect(tool).toBeDefined();
    expect(config).toBeDefined();
    expect(config.agent).toBe(agent);
    expect(toolName).toBe("transfer_to_billing");
  });

  it("should use custom toolName from HandoffConfig", () => {
    const agent = createMockAgent("billing");
    const result = handoffToTool(handoff(agent, { toolName: "route_billing" }));

    expect(result.toolName).toBe("route_billing");
  });

  it("should produce a tool with default description mentioning agent name", () => {
    const agent = createMockAgent("billing");
    const { tool } = handoffToTool(agent);

    expect((tool as Record<string, unknown>).description).toContain("billing");
  });

  it("should use custom toolDescription from HandoffConfig", () => {
    const agent = createMockAgent("billing");
    const { tool } = handoffToTool(
      handoff(agent, { toolDescription: "Custom desc" }),
    );

    expect((tool as Record<string, unknown>).description).toBe("Custom desc");
  });

  it("should produce a tool with optional reason parameter", () => {
    const agent = createMockAgent("billing");
    const { tool } = handoffToTool(agent);

    expect(tool).toHaveProperty("parameters");
  });

  it("should return sentinel { __handoff: true, targetAgent } from execute", async () => {
    const agent = createMockAgent("billing");
    const { tool } = handoffToTool(agent);
    const execute = (tool as Record<string, unknown>).execute as (
      args: Record<string, unknown>,
    ) => Promise<unknown>;

    const result = await execute({ reason: "user asked about billing" });

    expect(result).toEqual({
      __handoff: true,
      targetAgent: "billing",
    });
  });

  it("should return sentinel without reason when reason is not provided", async () => {
    const agent = createMockAgent("support");
    const { tool } = handoffToTool(agent);
    const execute = (tool as Record<string, unknown>).execute as (
      args: Record<string, unknown>,
    ) => Promise<unknown>;

    const result = await execute({});

    expect(result).toEqual({
      __handoff: true,
      targetAgent: "support",
    });
  });

  it("should return both the tool and the resolved config", () => {
    const agent = createMockAgent("billing");
    const result = handoffToTool(agent);

    expect(result).toHaveProperty("tool");
    expect(result).toHaveProperty("config");
    expect(result.config.agent).toBe(agent);
  });

  it("should handle agent names with special chars (spaces, hyphens)", () => {
    const agent = createMockAgent("billing support-team");
    const result = handoffToTool(agent);

    expect(result.toolName).toMatch(/^transfer_to_/);
    expect(result.toolName).not.toMatch(/[\s-]/);
  });

  it("should accept a raw AgentInstance and normalize internally", () => {
    const agent = createMockAgent("billing");
    const { config } = handoffToTool(agent);

    expect(config.agent).toBe(agent);
  });
});

// ---------------------------------------------------------------------------
// isHandoffResult()
// ---------------------------------------------------------------------------

describe("isHandoffResult", () => {
  it("should return true for valid handoff sentinel", () => {
    expect(isHandoffResult({ __handoff: true, targetAgent: "billing" })).toBe(
      true,
    );
  });

  it("should return false for plain object without __handoff", () => {
    expect(isHandoffResult({ targetAgent: "billing" })).toBe(false);
  });

  it("should return false for null", () => {
    expect(isHandoffResult(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isHandoffResult(undefined)).toBe(false);
  });

  it("should return false for string", () => {
    expect(isHandoffResult("handoff")).toBe(false);
  });

  it("should return false for { __handoff: false }", () => {
    expect(isHandoffResult({ __handoff: false, targetAgent: "billing" })).toBe(
      false,
    );
  });

  it("should return false for { __handoff: true } without targetAgent", () => {
    expect(isHandoffResult({ __handoff: true })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handoffFilters
// ---------------------------------------------------------------------------

describe("handoffFilters", () => {
  describe("removeToolMessages", () => {
    it('should remove messages with role "tool"', () => {
      const result = handoffFilters.removeToolMessages(sampleMessages);
      const hasToolMsg = result.some((m) => m.role === "tool");

      expect(hasToolMsg).toBe(false);
    });

    it("should remove assistant messages containing tool calls", () => {
      const result = handoffFilters.removeToolMessages(sampleMessages);
      const hasToolCallAssistant = result.some(
        (m) =>
          m.role === "assistant" &&
          Array.isArray(m.content) &&
          m.content.some((p) => "type" in p && p.type === "tool-call"),
      );

      expect(hasToolCallAssistant).toBe(false);
    });

    it("should keep user and plain assistant messages", () => {
      const result = handoffFilters.removeToolMessages(sampleMessages);
      const userCount = result.filter((m) => m.role === "user").length;
      const assistantCount = result.filter(
        (m) => m.role === "assistant",
      ).length;

      expect(userCount).toBe(2);
      expect(assistantCount).toBe(2);
    });

    it("should return empty array for empty input", () => {
      const result = handoffFilters.removeToolMessages([]);

      expect(result).toEqual([]);
    });
  });

  describe("keepLast", () => {
    it("should keep only last N messages", () => {
      const filter = handoffFilters.keepLast(2);
      const result = filter(sampleMessages);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(sampleMessages[sampleMessages.length - 2]);
      expect(result[1]).toBe(sampleMessages[sampleMessages.length - 1]);
    });

    it("should return all messages when N > array length", () => {
      const filter = handoffFilters.keepLast(100);
      const result = filter(sampleMessages);

      expect(result).toHaveLength(sampleMessages.length);
    });

    it("should return empty array when N is 0", () => {
      const filter = handoffFilters.keepLast(0);
      const result = filter(sampleMessages);

      expect(result).toEqual([]);
    });

    it("should return empty array for empty input", () => {
      const filter = handoffFilters.keepLast(5);
      const result = filter([]);

      expect(result).toEqual([]);
    });
  });

  describe("removeAll", () => {
    it("should return empty array regardless of input", () => {
      expect(handoffFilters.removeAll(sampleMessages)).toEqual([]);
      expect(handoffFilters.removeAll([])).toEqual([]);
    });
  });

  describe("keepConversation", () => {
    it("should keep only user and assistant messages", () => {
      const result = handoffFilters.keepConversation(sampleMessages);

      result.forEach((m) => {
        expect(["user", "assistant"]).toContain(m.role);
      });
    });

    it("should remove system and tool messages", () => {
      const result = handoffFilters.keepConversation(sampleMessages);
      const hasSystem = result.some((m) => m.role === "system");
      const hasTool = result.some((m) => m.role === "tool");

      expect(hasSystem).toBe(false);
      expect(hasTool).toBe(false);
    });

    it("should return empty array for empty input", () => {
      expect(handoffFilters.keepConversation([])).toEqual([]);
    });
  });

  describe("compose", () => {
    it("should chain filters left-to-right", () => {
      const composed = handoffFilters.compose(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        handoffFilters.removeToolMessages,
        handoffFilters.keepLast(2),
      );

      const result = composed(sampleMessages);

      expect(result).toHaveLength(2);
      result.forEach((m) => {
        expect(m.role).not.toBe("tool");
      });
    });

    it("should work with single filter", () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const composed = handoffFilters.compose(handoffFilters.removeAll);
      const result = composed(sampleMessages);

      expect(result).toEqual([]);
    });

    it("should work with zero filters (identity)", () => {
      const composed = handoffFilters.compose();
      const result = composed(sampleMessages);

      expect(result).toBe(sampleMessages);
    });

    it("should compose removeToolMessages + keepLast correctly", () => {
      const composed = handoffFilters.compose(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        handoffFilters.removeToolMessages,
        handoffFilters.keepLast(3),
      );

      const result = composed(sampleMessages);

      expect(result).toHaveLength(3);
      result.forEach((m) => {
        expect(m.role).not.toBe("tool");
        if (m.role === "assistant") {
          if (Array.isArray(m.content)) {
            m.content.forEach((part) => {
              expect("type" in part && part.type).not.toBe("tool-call");
            });
          }
        }
      });
    });
  });
});
