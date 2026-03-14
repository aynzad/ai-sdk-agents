import {
  generateText,
  streamText,
  stepCountIs,
  Output,
  convertToModelMessages,
} from "ai";
import type { LanguageModel, ModelMessage, ToolSet, UIMessage } from "ai";

import type {
  AgentInstance,
  HandoffConfig,
  RunConfig,
  RunContext,
  RunResult,
  RunStep,
  StreamResult,
  StreamEvent,
} from "@/types";
import {
  MaxTurnsExceededError,
  GuardrailTripwiredError,
  ToolGuardrailTripwiredError,
} from "@/types";
import { handoffToTool, isHandoffResult } from "@/handoff/handoff";
import { runGuardrails } from "@/guardrail/guardrail";
import {
  isGuardedTool,
  wrapToolWithGuardrails,
} from "@/guardrail/tool-guardrail";
import { Trace } from "@/tracing/tracing";

const DEFAULT_MAX_TURNS = 10;

function resolveModel<TContext>(
  agent: AgentInstance<TContext, unknown>,
  config?: RunConfig<TContext>,
): LanguageModel {
  const raw = config?.model ?? agent.config.model;
  if (typeof raw === "string") {
    throw new Error(
      `String model identifiers are not yet supported. ` +
        `Pass a LanguageModel instance instead (received: "${raw}").`,
    );
  }
  return raw;
}

interface ToolResultEntry {
  toolName?: string;
  output?: unknown;
}

interface FullStreamPart {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
}

export class Runner {
  static async run<TContext = unknown, TOutput = string>(
    agent: AgentInstance<TContext, TOutput>,
    input: string | ModelMessage[],
    config?: RunConfig<TContext>,
  ): Promise<RunResult<TOutput>> {
    const maxTurns = config?.maxTurns ?? DEFAULT_MAX_TURNS;
    let messages: ModelMessage[] =
      typeof input === "string"
        ? [{ role: "user", content: input }]
        : [...input];

    const steps: RunStep[] = [];
    const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let currentAgent: AgentInstance<TContext, unknown> = agent as AgentInstance<
      TContext,
      unknown
    >;
    let turn = 0;

    const tracingEnabled = config?.tracing?.enabled !== false;
    const traceInstance = tracingEnabled
      ? new Trace(currentAgent.name, config?.tracing?.processors)
      : null;
    const traceId = config?.tracing?.traceId ?? traceInstance?.traceId ?? "";

    const ctx: RunContext<TContext> = {
      context: config?.context ?? ({} as TContext),
      agent: currentAgent.name,
      traceId,
      turn,
      signal: config?.signal,
    };

    try {
      await config?.hooks?.onRunStart?.(ctx);
    } catch {
      /* hooks never break the run */
    }

    while (turn < maxTurns) {
      turn++;
      ctx.agent = currentAgent.name;
      ctx.turn = turn;

      try {
        await config?.hooks?.onAgentStart?.(ctx);
      } catch {
        /* */
      }
      try {
        await currentAgent.config.hooks?.onStart?.(ctx);
      } catch {
        /* */
      }

      const agentSpan = traceInstance?.span({
        name: currentAgent.name,
        type: "agent",
      });

      if (currentAgent.config.inputGuardrails?.length) {
        const guardResult = await runGuardrails(
          currentAgent.config.inputGuardrails,
          ctx,
          { messages, agentName: currentAgent.name },
        );
        if (guardResult.tripwired) {
          try {
            await config?.hooks?.onGuardrailTripped?.(ctx, guardResult);
          } catch {
            /* */
          }
          agentSpan?.end();
          throw new GuardrailTripwiredError(
            guardResult.guardrailName ?? "unknown",
            guardResult.reason,
            guardResult.metadata,
          );
        }
      }

      const system = await (
        currentAgent as unknown as {
          resolveInstructions(c: RunContext<TContext>): Promise<string>;
        }
      ).resolveInstructions(ctx);

      const handoffMap = new Map<string, HandoffConfig<TContext>>();
      const agentTools: ToolSet = {};

      for (const [tName, t] of Object.entries(
        currentAgent.config.tools ?? {},
      )) {
        agentTools[tName] = isGuardedTool(t)
          ? wrapToolWithGuardrails(tName, t, ctx)
          : t;
      }

      if (currentAgent.config.handoffs?.length) {
        for (const target of currentAgent.config.handoffs) {
          const { tool, config: hConfig, toolName } = handoffToTool(target);
          agentTools[toolName] = tool;
          handoffMap.set(toolName, hConfig);
        }
      }

      const model = resolveModel(currentAgent, config);

      let genResult;
      try {
        genResult = await generateText({
          model,
          system,
          messages: [...messages],
          tools: Object.keys(agentTools).length > 0 ? agentTools : undefined,
          stopWhen: stepCountIs(currentAgent.config.maxToolRoundtrips ?? 10),
          ...(currentAgent.config.outputSchema
            ? {
                output: Output.object({
                  schema: currentAgent.config.outputSchema,
                }),
              }
            : {}),
          ...(currentAgent.config.modelSettings ?? {}),
          ...(ctx.signal ? { abortSignal: ctx.signal } : {}),
        });
      } catch (err) {
        if (err instanceof ToolGuardrailTripwiredError) {
          try {
            await config?.hooks?.onGuardrailTripped?.(ctx, {
              tripwired: true,
              reason: err.reason,
              metadata: { ...err.metadata, toolName: err.toolName },
            });
          } catch {
            /* */
          }
          agentSpan?.end();
        }
        throw err;
      }

      usage.inputTokens += genResult.totalUsage.inputTokens ?? 0;
      usage.outputTokens += genResult.totalUsage.outputTokens ?? 0;
      usage.totalTokens += genResult.totalUsage.totalTokens ?? 0;

      let handoffOccurred = false;
      let handoffTargetConfig: HandoffConfig<TContext> | null = null;

      for (const step of genResult.steps) {
        for (const tc of step.toolCalls) {
          try {
            await currentAgent.config.hooks?.onToolCall?.(
              ctx,
              tc.toolName,
              tc.input,
            );
          } catch {
            /* */
          }
          steps.push({
            type: "tool_call",
            agent: currentAgent.name,
            timestamp: Date.now(),
            data: tc,
          });
        }
        for (const tr of step.toolResults as ToolResultEntry[]) {
          try {
            await currentAgent.config.hooks?.onToolResult?.(
              ctx,
              tr.toolName ?? "",
              tr.output,
            );
          } catch {
            /* */
          }
          steps.push({
            type: "tool_result",
            agent: currentAgent.name,
            timestamp: Date.now(),
            data: tr,
          });

          if (isHandoffResult(tr.output)) {
            const toolName = tr.toolName;
            handoffTargetConfig = toolName
              ? (handoffMap.get(toolName) ?? null)
              : null;

            if (!handoffTargetConfig) {
              for (const [, hc] of handoffMap) {
                if (
                  hc.agent.name ===
                  (tr.output as { targetAgent: string }).targetAgent
                ) {
                  handoffTargetConfig = hc;
                  break;
                }
              }
            }

            if (handoffTargetConfig) {
              handoffOccurred = true;
              break;
            }
          }
        }
        if (handoffOccurred) break;
      }

      if (handoffOccurred && handoffTargetConfig) {
        const targetName = handoffTargetConfig.agent.name;

        try {
          await handoffTargetConfig.onHandoff?.(ctx);
        } catch {
          /* */
        }
        try {
          await currentAgent.config.hooks?.onHandoff?.(ctx, targetName);
        } catch {
          /* */
        }
        try {
          await config?.hooks?.onHandoff?.(ctx, currentAgent.name, targetName);
        } catch {
          /* */
        }

        steps.push({
          type: "handoff",
          agent: currentAgent.name,
          timestamp: Date.now(),
          data: { from: currentAgent.name, to: targetName },
        });

        if (handoffTargetConfig.inputFilter) {
          messages = handoffTargetConfig.inputFilter(messages);
        }

        try {
          await config?.hooks?.onAgentEnd?.(ctx, "");
        } catch {
          /* */
        }
        try {
          await currentAgent.config.hooks?.onEnd?.(ctx, "");
        } catch {
          /* */
        }
        agentSpan?.end();

        currentAgent = handoffTargetConfig.agent;
        continue;
      }

      messages.push({ role: "assistant", content: genResult.text });
      steps.push({
        type: "message",
        agent: currentAgent.name,
        timestamp: Date.now(),
        data: { text: genResult.text },
      });

      try {
        await config?.hooks?.onAgentEnd?.(ctx, genResult.text);
      } catch {
        /* */
      }
      try {
        await currentAgent.config.hooks?.onEnd?.(ctx, genResult.text);
      } catch {
        /* */
      }
      agentSpan?.end();

      if (currentAgent.config.outputGuardrails?.length) {
        const outputMessages: ModelMessage[] = [
          { role: "assistant", content: genResult.text },
        ];
        const guardResult = await runGuardrails(
          currentAgent.config.outputGuardrails,
          ctx,
          { messages: outputMessages, agentName: currentAgent.name },
        );
        if (guardResult.tripwired) {
          try {
            await config?.hooks?.onGuardrailTripped?.(ctx, guardResult);
          } catch {
            /* */
          }
          throw new GuardrailTripwiredError(
            guardResult.guardrailName ?? "unknown",
            guardResult.reason,
            guardResult.metadata,
          );
        }
      }

      const output: unknown = currentAgent.config.outputSchema
        ? genResult.output
        : genResult.text;

      const runResult: RunResult<TOutput> = {
        output: output as TOutput,
        agent: currentAgent.name,
        steps,
        usage,
        traceId: traceInstance?.traceId,
      };

      try {
        await config?.hooks?.onRunEnd?.(ctx, runResult);
      } catch {
        /* */
      }
      traceInstance?.end();
      return runResult;
    }

    traceInstance?.end();
    throw new MaxTurnsExceededError(maxTurns);
  }

  static stream<TContext = unknown, TOutput = string>(
    agent: AgentInstance<TContext, TOutput>,
    input: string | ModelMessage[],
    config?: RunConfig<TContext>,
  ): StreamResult<TOutput> {
    let resolveResult: (value: RunResult<TOutput>) => void;
    let rejectResult: (reason: unknown) => void;
    const resultPromise = new Promise<RunResult<TOutput>>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    async function* eventGenerator(): AsyncGenerator<StreamEvent> {
      const maxTurns = config?.maxTurns ?? DEFAULT_MAX_TURNS;
      let messages: ModelMessage[] =
        typeof input === "string"
          ? [{ role: "user", content: input }]
          : [...input];

      const steps: RunStep[] = [];
      const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      let currentAgent: AgentInstance<TContext, unknown> =
        agent as AgentInstance<TContext, unknown>;
      let turn = 0;

      const tracingEnabled = config?.tracing?.enabled !== false;
      const traceInstance = tracingEnabled
        ? new Trace(currentAgent.name, config?.tracing?.processors)
        : null;
      const traceId = config?.tracing?.traceId ?? traceInstance?.traceId ?? "";

      const ctx: RunContext<TContext> = {
        context: config?.context ?? ({} as TContext),
        agent: currentAgent.name,
        traceId,
        turn,
        signal: config?.signal,
      };

      try {
        await config?.hooks?.onRunStart?.(ctx);
      } catch {
        /* hooks never break the run */
      }

      try {
        while (turn < maxTurns) {
          turn++;
          ctx.agent = currentAgent.name;
          ctx.turn = turn;

          try {
            await config?.hooks?.onAgentStart?.(ctx);
          } catch {
            /* */
          }
          try {
            await currentAgent.config.hooks?.onStart?.(ctx);
          } catch {
            /* */
          }

          const agentSpan = traceInstance?.span({
            name: currentAgent.name,
            type: "agent",
          });

          yield {
            type: "agent_start",
            agent: currentAgent.name,
            timestamp: Date.now(),
          };

          if (currentAgent.config.inputGuardrails?.length) {
            const guardResult = await runGuardrails(
              currentAgent.config.inputGuardrails,
              ctx,
              { messages, agentName: currentAgent.name },
            );
            if (guardResult.tripwired) {
              try {
                await config?.hooks?.onGuardrailTripped?.(ctx, guardResult);
              } catch {
                /* */
              }
              agentSpan?.end();
              throw new GuardrailTripwiredError(
                guardResult.guardrailName ?? "unknown",
                guardResult.reason,
                guardResult.metadata,
              );
            }
          }

          const system = await (
            currentAgent as unknown as {
              resolveInstructions(c: RunContext<TContext>): Promise<string>;
            }
          ).resolveInstructions(ctx);

          const handoffMap = new Map<string, HandoffConfig<TContext>>();
          const agentTools: ToolSet = {};

          for (const [tName, t] of Object.entries(
            currentAgent.config.tools ?? {},
          )) {
            agentTools[tName] = isGuardedTool(t)
              ? wrapToolWithGuardrails(tName, t, ctx)
              : t;
          }

          if (currentAgent.config.handoffs?.length) {
            for (const target of currentAgent.config.handoffs) {
              const { tool, config: hConfig, toolName } = handoffToTool(target);
              agentTools[toolName] = tool;
              handoffMap.set(toolName, hConfig);
            }
          }

          const model = resolveModel(currentAgent, config);

          const sResult = streamText({
            model,
            system,
            messages: [...messages],
            tools: Object.keys(agentTools).length > 0 ? agentTools : undefined,
            stopWhen: stepCountIs(currentAgent.config.maxToolRoundtrips ?? 10),
            ...(currentAgent.config.outputSchema
              ? {
                  output: Output.object({
                    schema: currentAgent.config.outputSchema,
                  }),
                }
              : {}),
            ...(currentAgent.config.modelSettings ?? {}),
            ...(ctx.signal ? { abortSignal: ctx.signal } : {}),
          });

          let handoffOccurred = false;
          let handoffTargetConfig: HandoffConfig<TContext> | null = null;
          const collectedText: string[] = [];

          for await (const part of sResult.fullStream as AsyncIterable<FullStreamPart>) {
            if (part.type === "text-delta" && !handoffOccurred) {
              collectedText.push(part.text!);
              yield {
                type: "text_delta",
                delta: part.text!,
                agent: currentAgent.name,
              };
            } else if (part.type === "tool-call") {
              try {
                await currentAgent.config.hooks?.onToolCall?.(
                  ctx,
                  part.toolName!,
                  part.input,
                );
              } catch {
                /* */
              }
              yield {
                type: "tool_call_start",
                toolName: part.toolName!,
                agent: currentAgent.name,
                args: part.input,
              };
              steps.push({
                type: "tool_call",
                agent: currentAgent.name,
                timestamp: Date.now(),
                data: {
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  input: part.input,
                },
              });
            } else if (part.type === "tool-result") {
              try {
                await currentAgent.config.hooks?.onToolResult?.(
                  ctx,
                  part.toolName!,
                  part.output,
                );
              } catch {
                /* */
              }
              yield {
                type: "tool_call_end",
                toolName: part.toolName!,
                agent: currentAgent.name,
                output: part.output,
              };
              steps.push({
                type: "tool_result",
                agent: currentAgent.name,
                timestamp: Date.now(),
                data: {
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  output: part.output,
                },
              });

              if (!handoffOccurred && isHandoffResult(part.output)) {
                handoffTargetConfig = part.toolName
                  ? (handoffMap.get(part.toolName) ?? null)
                  : null;

                if (!handoffTargetConfig) {
                  for (const [, hc] of handoffMap) {
                    if (
                      hc.agent.name ===
                      (part.output as { targetAgent: string }).targetAgent
                    ) {
                      handoffTargetConfig = hc;
                      break;
                    }
                  }
                }

                if (handoffTargetConfig) {
                  handoffOccurred = true;
                }
              }
            }
          }

          const turnUsage = await sResult.totalUsage;
          usage.inputTokens += turnUsage.inputTokens ?? 0;
          usage.outputTokens += turnUsage.outputTokens ?? 0;
          usage.totalTokens += turnUsage.totalTokens ?? 0;

          if (handoffOccurred && handoffTargetConfig) {
            const targetName = handoffTargetConfig.agent.name;

            try {
              await handoffTargetConfig.onHandoff?.(ctx);
            } catch {
              /* */
            }
            try {
              await currentAgent.config.hooks?.onHandoff?.(ctx, targetName);
            } catch {
              /* */
            }
            try {
              await config?.hooks?.onHandoff?.(
                ctx,
                currentAgent.name,
                targetName,
              );
            } catch {
              /* */
            }

            steps.push({
              type: "handoff",
              agent: currentAgent.name,
              timestamp: Date.now(),
              data: { from: currentAgent.name, to: targetName },
            });

            yield {
              type: "handoff",
              from: currentAgent.name,
              to: targetName,
              timestamp: Date.now(),
            };

            if (handoffTargetConfig.inputFilter) {
              messages = handoffTargetConfig.inputFilter(messages);
            }

            try {
              await config?.hooks?.onAgentEnd?.(ctx, "");
            } catch {
              /* */
            }
            try {
              await currentAgent.config.hooks?.onEnd?.(ctx, "");
            } catch {
              /* */
            }

            yield {
              type: "agent_end",
              agent: currentAgent.name,
              timestamp: Date.now(),
            };
            agentSpan?.end();

            currentAgent = handoffTargetConfig.agent;
            continue;
          }

          const finalText = collectedText.join("");
          messages.push({ role: "assistant", content: finalText });
          steps.push({
            type: "message",
            agent: currentAgent.name,
            timestamp: Date.now(),
            data: { text: finalText },
          });

          try {
            await config?.hooks?.onAgentEnd?.(ctx, finalText);
          } catch {
            /* */
          }
          try {
            await currentAgent.config.hooks?.onEnd?.(ctx, finalText);
          } catch {
            /* */
          }

          yield {
            type: "agent_end",
            agent: currentAgent.name,
            timestamp: Date.now(),
          };
          agentSpan?.end();

          if (currentAgent.config.outputGuardrails?.length) {
            const outputMessages: ModelMessage[] = [
              { role: "assistant", content: finalText },
            ];
            const guardResult = await runGuardrails(
              currentAgent.config.outputGuardrails,
              ctx,
              { messages: outputMessages, agentName: currentAgent.name },
            );
            if (guardResult.tripwired) {
              try {
                await config?.hooks?.onGuardrailTripped?.(ctx, guardResult);
              } catch {
                /* */
              }
              throw new GuardrailTripwiredError(
                guardResult.guardrailName ?? "unknown",
                guardResult.reason,
                guardResult.metadata,
              );
            }
          }

          const output: unknown = currentAgent.config.outputSchema
            ? await sResult.output
            : finalText;

          const runResult: RunResult<TOutput> = {
            output: output as TOutput,
            agent: currentAgent.name,
            steps,
            usage,
            traceId: traceInstance?.traceId,
          };

          try {
            await config?.hooks?.onRunEnd?.(ctx, runResult);
          } catch {
            /* */
          }
          traceInstance?.end();

          yield { type: "done", result: runResult as RunResult<unknown> };
          resolveResult!(runResult);
          return;
        }

        traceInstance?.end();
        throw new MaxTurnsExceededError(maxTurns);
      } catch (err) {
        if (err instanceof ToolGuardrailTripwiredError) {
          try {
            await config?.hooks?.onGuardrailTripped?.(ctx, {
              tripwired: true,
              reason: err.reason,
              metadata: { ...err.metadata, toolName: err.toolName },
            });
          } catch {
            /* */
          }
        }
        yield {
          type: "error",
          error: err instanceof Error ? err : new Error(String(err)),
          agent: currentAgent.name,
        };
        rejectResult!(err);
      }
    }

    return {
      events: eventGenerator(),
      result: resultPromise,
    };
  }

  /**
   * Single-turn UI streaming that returns a native AI SDK Response.
   *
   * Resolves the agent's instructions, merges server tools (`tools`) with
   * client-side tools (`clientTools`), runs input guardrails, and delegates
   * to `streamText().toUIMessageStreamResponse()`.
   *
   * The multi-turn loop for human-in-the-loop is driven by the client
   * (`useChat` + `sendAutomaticallyWhen` + `addToolOutput`), which re-posts
   * to the route after each tool output is provided.
   *
   * Does NOT support handoffs or multi-turn agent loops (use `Runner.stream()`
   * for those). Supports: dynamic instructions, input guardrails, model
   * settings, hooks, and merged server + client tools.
   */
  static async streamUI<TContext = unknown>(
    agent: AgentInstance<TContext, unknown>,
    messages: UIMessage[],
    config?: RunConfig<TContext>,
  ): Promise<Response> {
    const model = resolveModel(agent, config);

    const ctx: RunContext<TContext> = {
      context: config?.context ?? ({} as TContext),
      agent: agent.name,
      traceId: "",
      turn: 1,
      signal: config?.signal,
    };

    try {
      await agent.config.hooks?.onStart?.(ctx);
    } catch {
      /* hooks never break the run */
    }

    if (agent.config.inputGuardrails?.length) {
      const modelMessages = await convertToModelMessages(messages);
      const guardResult = await runGuardrails(
        agent.config.inputGuardrails,
        ctx,
        { messages: modelMessages, agentName: agent.name },
      );
      if (guardResult.tripwired) {
        throw new GuardrailTripwiredError(
          guardResult.guardrailName ?? "unknown",
          guardResult.reason,
          guardResult.metadata,
        );
      }
    }

    const system = await (
      agent as unknown as {
        resolveInstructions(c: RunContext<TContext>): Promise<string>;
      }
    ).resolveInstructions(ctx);

    const agentTools: ToolSet = {};

    for (const [tName, t] of Object.entries(agent.config.tools ?? {})) {
      agentTools[tName] = isGuardedTool(t)
        ? wrapToolWithGuardrails(tName, t, ctx)
        : t;
    }

    for (const [tName, t] of Object.entries(agent.config.clientTools ?? {})) {
      agentTools[tName] = t;
    }

    const result = streamText({
      model,
      system,
      messages: await convertToModelMessages(messages),
      tools: Object.keys(agentTools).length > 0 ? agentTools : undefined,
      stopWhen: stepCountIs(agent.config.maxToolRoundtrips ?? 10),
      ...(agent.config.modelSettings ?? {}),
      ...(ctx.signal ? { abortSignal: ctx.signal } : {}),
    });

    const response = result.toUIMessageStreamResponse();

    Promise.resolve(result.text)
      .then(async (text) => {
        try {
          await agent.config.hooks?.onEnd?.(ctx, text);
        } catch {
          /* hooks never break the run */
        }
      })
      .catch(() => {
        /* swallow — error surfaces via the stream */
      });

    return response;
  }
}
