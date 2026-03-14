import { describe, it, expect, vi } from "vitest";
import type { z } from "zod";
import type { LanguageModelV1 } from "ai";
import type { RunContext } from "@/types";
import { Agent } from "./agent";

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

function createRunContext(
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

describe("Agent", () => {
  describe("constructor", () => {
    it("should create an agent with valid config", () => {
      const agent = new Agent({
        name: "my-agent",
        instructions: "You are a helpful assistant.",
        model: mockModel,
      });

      expect(agent).toBeDefined();
      expect(agent.name).toBe("my-agent");
    });

    it("should throw when name is empty string", () => {
      expect(
        () =>
          new Agent({
            name: "",
            instructions: "test",
            model: mockModel,
          }),
      ).toThrow();
    });

    it("should throw when name is not provided", () => {
      expect(
        () =>
          new Agent({
            name: undefined as unknown as string,
            instructions: "test",
            model: mockModel,
          }),
      ).toThrow();
    });

    it("should throw when model is not provided", () => {
      expect(
        () =>
          new Agent({
            name: "my-agent",
            instructions: "test",
            model: undefined as unknown as LanguageModelV1,
          }),
      ).toThrow();
    });

    it("should set maxToolRoundtrips default to 10", () => {
      const agent = new Agent({
        name: "my-agent",
        instructions: "test",
        model: mockModel,
      });

      expect(agent.config.maxToolRoundtrips).toBe(10);
    });

    it("should accept custom maxToolRoundtrips", () => {
      const agent = new Agent({
        name: "my-agent",
        instructions: "test",
        model: mockModel,
        maxToolRoundtrips: 5,
      });

      expect(agent.config.maxToolRoundtrips).toBe(5);
    });

    it("should store the full config accessible via .config", () => {
      const instructions = "You are helpful.";
      const agent = new Agent({
        name: "my-agent",
        instructions,
        model: mockModel,
      });

      expect(agent.config.name).toBe("my-agent");
      expect(agent.config.instructions).toBe(instructions);
      expect(agent.config.model).toBe(mockModel);
    });

    it("should expose name as readonly matching config.name", () => {
      const agent = new Agent({
        name: "readonly-test",
        instructions: "test",
        model: mockModel,
      });

      expect(agent.name).toBe("readonly-test");
      expect(agent.name).toBe(agent.config.name);
    });

    it("should store optional config fields", () => {
      const hooks = { onStart: vi.fn() };
      const modelSettings = { temperature: 0.7 };

      const agent = new Agent({
        name: "full-agent",
        instructions: "test",
        model: mockModel,
        hooks,
        modelSettings,
        tools: {},
        handoffs: [],
        inputGuardrails: [],
        outputGuardrails: [],
      });

      expect(agent.config.hooks).toBe(hooks);
      expect(agent.config.modelSettings).toBe(modelSettings);
      expect(agent.config.tools).toEqual({});
      expect(agent.config.handoffs).toEqual([]);
    });
  });

  describe("resolveInstructions", () => {
    it("should return static string instructions", async () => {
      const agent = new Agent({
        name: "my-agent",
        instructions: "You are a helpful assistant.",
        model: mockModel,
      });

      const ctx = createRunContext();
      const result = await agent.resolveInstructions(ctx);

      expect(result).toBe("You are a helpful assistant.");
    });

    it("should call async function instructions with context", async () => {
      const instructionsFn = vi.fn().mockResolvedValue("dynamic instructions");

      const agent = new Agent({
        name: "my-agent",
        instructions: instructionsFn,
        model: mockModel,
      });

      const ctx = createRunContext({ agent: "my-agent", turn: 3 });
      const result = await agent.resolveInstructions(ctx);

      expect(result).toBe("dynamic instructions");
      expect(instructionsFn).toHaveBeenCalledWith(ctx);
    });

    it("should handle sync function instructions", async () => {
      const agent = new Agent({
        name: "my-agent",
        instructions: (ctx) => `Hello from turn ${ctx.turn}`,
        model: mockModel,
      });

      const ctx = createRunContext({ turn: 5 });
      const result = await agent.resolveInstructions(ctx);

      expect(result).toBe("Hello from turn 5");
    });

    it("should pass the full RunContext to instruction functions", async () => {
      const instructionsFn = vi.fn().mockReturnValue("ok");

      const agent = new Agent({
        name: "my-agent",
        instructions: instructionsFn,
        model: mockModel,
      });

      const ctx = createRunContext({
        context: { userId: "abc" },
        agent: "my-agent",
        traceId: "trace-xyz",
        turn: 2,
      });

      await agent.resolveInstructions(ctx);

      expect(instructionsFn).toHaveBeenCalledWith(
        expect.objectContaining({
          context: { userId: "abc" },
          agent: "my-agent",
          traceId: "trace-xyz",
          turn: 2,
        }),
      );
    });
  });

  describe("clone", () => {
    it("should create a new agent with overrides", () => {
      const original = new Agent({
        name: "original",
        instructions: "original instructions",
        model: mockModel,
      });

      const cloned = original.clone({ name: "cloned" });

      expect(cloned.name).toBe("cloned");
      expect(cloned).not.toBe(original);
    });

    it("should not modify the original agent", () => {
      const original = new Agent({
        name: "original",
        instructions: "original instructions",
        model: mockModel,
      });

      original.clone({ name: "cloned", instructions: "new instructions" });

      expect(original.name).toBe("original");
      expect(original.config.instructions).toBe("original instructions");
    });

    it("should preserve non-overridden config values", () => {
      const original = new Agent({
        name: "original",
        instructions: "keep me",
        model: mockModel,
        maxToolRoundtrips: 7,
        modelSettings: { temperature: 0.5 },
      });

      const cloned = original.clone({ name: "cloned" });

      expect(cloned.config.instructions).toBe("keep me");
      expect(cloned.config.model).toBe(mockModel);
      expect(cloned.config.maxToolRoundtrips).toBe(7);
      expect(cloned.config.modelSettings).toEqual({ temperature: 0.5 });
    });

    it("should return an independent instance", () => {
      const original = new Agent({
        name: "original",
        instructions: "test",
        model: mockModel,
      });

      const cloned = original.clone({ name: "cloned" });
      const clonedAgain = cloned.clone({ name: "cloned-again" });

      expect(original.name).toBe("original");
      expect(cloned.name).toBe("cloned");
      expect(clonedAgain.name).toBe("cloned-again");
    });

    it("should inherit maxToolRoundtrips default if not overridden", () => {
      const original = new Agent({
        name: "original",
        instructions: "test",
        model: mockModel,
      });

      const cloned = original.clone({ name: "cloned" });

      expect(cloned.config.maxToolRoundtrips).toBe(10);
    });

    it("should be an instance of Agent", () => {
      const original = new Agent({
        name: "original",
        instructions: "test",
        model: mockModel,
      });

      const cloned = original.clone({ name: "cloned" });

      expect(cloned).toBeInstanceOf(Agent);
    });
  });

  describe("asTool", () => {
    it("should return an object with parameters, description, and execute", () => {
      const agent = new Agent({
        name: "helper",
        instructions: "You help.",
        model: mockModel,
      });

      const tool = agent.asTool();

      expect(tool).toHaveProperty("parameters");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("execute");
    });

    it("should have a parameters schema that accepts { message: string }", () => {
      const agent = new Agent({
        name: "helper",
        instructions: "You help.",
        model: mockModel,
      });

      const tool = agent.asTool();
      const schema = tool.parameters as z.ZodType;
      const result = schema.safeParse({ message: "hello" });

      expect(result.success).toBe(true);
    });

    it("should reject invalid input in parameters schema", () => {
      const agent = new Agent({
        name: "helper",
        instructions: "You help.",
        model: mockModel,
      });

      const tool = agent.asTool();
      const schema = tool.parameters as z.ZodType;
      const result = schema.safeParse({ wrong: 123 });

      expect(result.success).toBe(false);
    });

    it("should use a default description derived from agent name", () => {
      const agent = new Agent({
        name: "billing-helper",
        instructions: "You handle billing.",
        model: mockModel,
      });

      const tool = agent.asTool();

      expect(tool.description).toContain("billing-helper");
    });

    it("should accept custom toolDescription from options", () => {
      const agent = new Agent({
        name: "helper",
        instructions: "You help.",
        model: mockModel,
      });

      const tool = agent.asTool({
        toolDescription: "A custom tool description",
      });

      expect(tool.description).toBe("A custom tool description");
    });

    it("should have an execute function", () => {
      const agent = new Agent({
        name: "helper",
        instructions: "You help.",
        model: mockModel,
      });

      const tool = agent.asTool();

      expect(typeof tool.execute).toBe("function");
    });
  });
});
