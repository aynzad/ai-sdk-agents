import type { Tool, ToolExecutionOptions } from "ai";
import type { z, ZodTypeAny } from "zod";
import type {
  RunContext,
  ToolGuardrailBehavior,
  ToolInputGuardrail,
  ToolInputGuardrailData,
  ToolOutputGuardrail,
  ToolOutputGuardrailData,
} from "@/types";
import { ToolGuardrailTripwiredError } from "@/types";

// ---------------------------------------------------------------------------
// ToolGuardrailBehaviorFactory
// ---------------------------------------------------------------------------

export const ToolGuardrailBehaviorFactory = {
  allow(): ToolGuardrailBehavior {
    return { type: "allow" };
  },
  rejectContent(message: string): ToolGuardrailBehavior {
    return { type: "rejectContent", message };
  },
  throwException(
    reason?: string,
    metadata?: Record<string, unknown>,
  ): ToolGuardrailBehavior {
    return {
      type: "throwException",
      ...(reason !== undefined && { reason }),
      ...(metadata !== undefined && { metadata }),
    };
  },
};

// ---------------------------------------------------------------------------
// defineToolInputGuardrail / defineToolOutputGuardrail
// ---------------------------------------------------------------------------

export function defineToolInputGuardrail<TContext = unknown>(config: {
  name: string;
  execute: (
    data: ToolInputGuardrailData<TContext>,
  ) => Promise<ToolGuardrailBehavior>;
}): ToolInputGuardrail<TContext> {
  if (!config.name || typeof config.name !== "string") {
    throw new Error("Tool input guardrail name must be a non-empty string");
  }
  if (typeof config.execute !== "function") {
    throw new Error("Tool input guardrail execute must be a function");
  }
  return { name: config.name, execute: config.execute };
}

export function defineToolOutputGuardrail<TContext = unknown>(config: {
  name: string;
  execute: (
    data: ToolOutputGuardrailData<TContext>,
  ) => Promise<ToolGuardrailBehavior>;
}): ToolOutputGuardrail<TContext> {
  if (!config.name || typeof config.name !== "string") {
    throw new Error("Tool output guardrail name must be a non-empty string");
  }
  if (typeof config.execute !== "function") {
    throw new Error("Tool output guardrail execute must be a function");
  }
  return { name: config.name, execute: config.execute };
}

// ---------------------------------------------------------------------------
// guardedTool — creates an AI SDK Tool with guardrail metadata
// ---------------------------------------------------------------------------

export interface ToolGuardrailsMetadata {
  inputGuardrails: ToolInputGuardrail[];
  outputGuardrails: ToolOutputGuardrail[];
}

export type GuardedTool<
  TParams extends ZodTypeAny = ZodTypeAny,
  TResult = unknown,
> = Tool<TParams, TResult> & {
  __toolGuardrails: ToolGuardrailsMetadata;
};

interface GuardedToolConfig<TParams extends ZodTypeAny, TResult> {
  description?: string;
  parameters: TParams;
  execute: (
    args: z.infer<TParams>,
    options: ToolExecutionOptions,
  ) => PromiseLike<TResult>;
  inputGuardrails?: ToolInputGuardrail[];
  outputGuardrails?: ToolOutputGuardrail[];
}

export function guardedTool<TParams extends ZodTypeAny, TResult>(
  config: GuardedToolConfig<TParams, TResult>,
): GuardedTool<TParams, TResult> {
  return {
    description: config.description,
    parameters: config.parameters,
    execute: config.execute,
    __toolGuardrails: {
      inputGuardrails: config.inputGuardrails ?? [],
      outputGuardrails: config.outputGuardrails ?? [],
    },
  };
}

// ---------------------------------------------------------------------------
// isGuardedTool / getToolGuardrails
// ---------------------------------------------------------------------------

export function isGuardedTool(tool: unknown): tool is GuardedTool {
  return (
    typeof tool === "object" && tool !== null && "__toolGuardrails" in tool
  );
}

export function getToolGuardrails(tool: unknown): ToolGuardrailsMetadata {
  if (isGuardedTool(tool)) {
    return {
      inputGuardrails: tool.__toolGuardrails.inputGuardrails,
      outputGuardrails: tool.__toolGuardrails.outputGuardrails,
    };
  }
  return { inputGuardrails: [], outputGuardrails: [] };
}

// ---------------------------------------------------------------------------
// runToolInputGuardrails / runToolOutputGuardrails — sequential executors
// ---------------------------------------------------------------------------

export type ToolGuardrailRunResult = ToolGuardrailBehavior & {
  guardrailName?: string;
};

export async function runToolInputGuardrails<TContext = unknown>(
  guardrails: ToolInputGuardrail<TContext>[],
  data: ToolInputGuardrailData<TContext>,
): Promise<ToolGuardrailRunResult> {
  for (const g of guardrails) {
    try {
      const behavior = await g.execute(data);
      if (behavior.type !== "allow") {
        return { ...behavior, guardrailName: g.name };
      }
    } catch (err) {
      return {
        type: "throwException",
        reason: `Tool input guardrail "${g.name}" threw: ${String(err instanceof Error ? err.message : err)}`,
        guardrailName: g.name,
      };
    }
  }
  return { type: "allow" };
}

export async function runToolOutputGuardrails<TContext = unknown>(
  guardrails: ToolOutputGuardrail<TContext>[],
  data: ToolOutputGuardrailData<TContext>,
): Promise<ToolGuardrailRunResult> {
  for (const g of guardrails) {
    try {
      const behavior = await g.execute(data);
      if (behavior.type !== "allow") {
        return { ...behavior, guardrailName: g.name };
      }
    } catch (err) {
      return {
        type: "throwException",
        reason: `Tool output guardrail "${g.name}" threw: ${String(err instanceof Error ? err.message : err)}`,
        guardrailName: g.name,
      };
    }
  }
  return { type: "allow" };
}

// ---------------------------------------------------------------------------
// wrapToolWithGuardrails — wraps a tool's execute with guardrail checks
// ---------------------------------------------------------------------------

type ToolExecuteFn = (
  args: Record<string, unknown>,
  options: ToolExecutionOptions,
) => PromiseLike<unknown>;

export function wrapToolWithGuardrails<
  TContext = unknown,
  TParams extends ZodTypeAny = ZodTypeAny,
  TResult = unknown,
>(
  toolName: string,
  tool: GuardedTool<TParams, TResult>,
  ctx: RunContext<TContext>,
): Tool {
  const { inputGuardrails, outputGuardrails } = getToolGuardrails(tool);
  const toolRecord = tool as unknown as Record<string, unknown>;
  const originalExecute: ToolExecuteFn = toolRecord.execute as ToolExecuteFn;
  const description = toolRecord.description as string | undefined;
  const parameters = toolRecord.parameters as ZodTypeAny;

  return {
    description,
    parameters,
    execute: async (
      args: Record<string, unknown>,
      options: ToolExecutionOptions,
    ): Promise<unknown> => {
      const baseData = {
        toolName,
        toolCallId: options.toolCallId,
        args,
        ctx,
      };

      const inputBehavior = await runToolInputGuardrails(
        inputGuardrails as ToolInputGuardrail<TContext>[],
        baseData,
      );

      if (inputBehavior.type === "throwException") {
        throw new ToolGuardrailTripwiredError(
          inputBehavior.guardrailName ?? toolName,
          toolName,
          inputBehavior.reason,
          inputBehavior.metadata,
        );
      }
      if (inputBehavior.type === "rejectContent") {
        return inputBehavior.message;
      }

      const result: unknown = await originalExecute(args, options);

      const outputBehavior = await runToolOutputGuardrails(
        outputGuardrails as ToolOutputGuardrail<TContext>[],
        { ...baseData, output: result },
      );

      if (outputBehavior.type === "throwException") {
        throw new ToolGuardrailTripwiredError(
          outputBehavior.guardrailName ?? toolName,
          toolName,
          outputBehavior.reason,
          outputBehavior.metadata,
        );
      }
      if (outputBehavior.type === "rejectContent") {
        return outputBehavior.message;
      }

      return result;
    },
  } as Tool;
}
