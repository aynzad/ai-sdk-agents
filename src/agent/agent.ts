import { z } from "zod";
import type { Tool } from "ai";
import type { RunContext } from "@/types";
import type { AgentConfig, AgentInstance, AsToolOptions } from "@/agent/types";
import { Runner } from "@/runner/runner";

const DEFAULT_MAX_TOOL_ROUNDTRIPS = 10;

export class Agent<
  TContext = unknown,
  TOutput = string,
> implements AgentInstance<TContext, TOutput> {
  readonly name: string;
  readonly config: AgentConfig<TContext, TOutput>;

  constructor(config: AgentConfig<TContext, TOutput>) {
    if (!config.name || typeof config.name !== "string") {
      throw new Error("Agent name is required and must be a non-empty string");
    }
    if (!config.model) {
      throw new Error("Agent model is required");
    }

    this.config = {
      ...config,
      maxToolRoundtrips:
        config.maxToolRoundtrips ?? DEFAULT_MAX_TOOL_ROUNDTRIPS,
    };
    this.name = this.config.name;
  }

  async resolveInstructions(ctx: RunContext<TContext>): Promise<string> {
    if (typeof this.config.instructions === "string") {
      return this.config.instructions;
    }
    return this.config.instructions(ctx);
  }

  clone(
    overrides: Partial<AgentConfig<TContext, TOutput>>,
  ): Agent<TContext, TOutput> {
    return new Agent<TContext, TOutput>({ ...this.config, ...overrides });
  }

  asTool(options?: AsToolOptions): Tool {
    const description = options?.toolDescription ?? `Ask agent "${this.name}"`;

    const inputSchema = z.object({
      message: z.string().describe("Input message for the agent"),
    });

    const agentRef = this as Agent<unknown, unknown>;

    return {
      description,
      inputSchema,
      execute: async ({ message }: { message: string }) => {
        const result = await Runner.run(agentRef, message);
        return result.output;
      },
    } as Tool;
  }
}
