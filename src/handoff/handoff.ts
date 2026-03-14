import { z } from "zod";
import type { Tool, CoreMessage } from "ai";
import type { AgentInstance, HandoffConfig, HandoffTarget } from "@/types";

function isAgentInstance(
  target: HandoffTarget,
): target is AgentInstance<unknown, unknown> {
  return "name" in target && "config" in target;
}

function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

export function handoff<TContext>(
  agent: AgentInstance<TContext, unknown>,
  options?: Omit<HandoffConfig<TContext>, "agent">,
): HandoffConfig<TContext> {
  return { agent, ...options };
}

export function normalizeHandoff<TContext>(
  target: HandoffTarget<TContext>,
): HandoffConfig<TContext> {
  if (isAgentInstance(target as HandoffTarget)) {
    return {
      agent: target as AgentInstance<TContext, unknown>,
    } satisfies HandoffConfig<TContext>;
  }
  return target as HandoffConfig<TContext>;
}

export function handoffToTool<TContext>(target: HandoffTarget<TContext>): {
  tool: Tool;
  config: HandoffConfig<TContext>;
  toolName: string;
} {
  const config = normalizeHandoff(target);
  const agentName = config.agent.name;
  const toolName =
    config.toolName ?? `transfer_to_${sanitizeToolName(agentName)}`;
  const description =
    config.toolDescription ?? `Transfer to agent "${agentName}"`;

  const parameters = z.object({
    reason: z.string().optional().describe("Reason for the handoff"),
  });

  const tool: Tool = {
    description,
    parameters,
    execute: () =>
      Promise.resolve({
        __handoff: true,
        targetAgent: agentName,
      }),
  } as Tool;

  return { tool, config, toolName };
}

export function isHandoffResult(
  result: unknown,
): result is { __handoff: true; targetAgent: string } {
  return (
    typeof result === "object" &&
    result !== null &&
    "__handoff" in result &&
    (result as Record<string, unknown>).__handoff === true &&
    "targetAgent" in result &&
    typeof (result as Record<string, unknown>).targetAgent === "string"
  );
}

type MessageFilter = (messages: CoreMessage[]) => CoreMessage[];

function hasToolCallContent(message: CoreMessage): boolean {
  if (message.role !== "assistant") return false;
  if (!Array.isArray(message.content)) return false;
  return message.content.some(
    (part) => "type" in part && part.type === "tool-call",
  );
}

export const handoffFilters = {
  removeToolMessages(messages: CoreMessage[]): CoreMessage[] {
    return messages.filter((m) => m.role !== "tool" && !hasToolCallContent(m));
  },

  keepLast(n: number): MessageFilter {
    return (messages: CoreMessage[]) => {
      if (n <= 0) return [];
      return messages.slice(-n);
    };
  },

  removeAll(_messages: CoreMessage[]): CoreMessage[] {
    return [];
  },

  keepConversation(messages: CoreMessage[]): CoreMessage[] {
    return messages.filter((m) => m.role === "user" || m.role === "assistant");
  },

  compose(...filters: MessageFilter[]): MessageFilter {
    return (messages: CoreMessage[]) =>
      filters.reduce<CoreMessage[]>((msgs, fn) => fn(msgs), messages);
  },
};
