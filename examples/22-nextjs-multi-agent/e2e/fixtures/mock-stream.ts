/**
 * Build mock UIMessageStream SSE bodies that simulate ai-sdk-agents
 * Runner.stream() events bridged through createUIMessageStreamResponse().
 */
export function buildChatSSE(text: string): string {
  const lines: string[] = [];
  lines.push(sseChunk({ type: "start" }));
  lines.push(sseChunk({ type: "start-step" }));
  lines.push(sseChunk({ type: "text-start", id: "text-0" }));
  lines.push(sseChunk({ type: "text-delta", id: "text-0", delta: text }));
  lines.push(sseChunk({ type: "text-end", id: "text-0" }));
  lines.push(sseChunk({ type: "finish-step" }));
  lines.push(sseChunk({ type: "finish", finishReason: "stop" }));
  return lines.join("");
}

/**
 * Build a mock SSE response that simulates a handoff from one agent
 * to another, followed by the target agent's response.
 */
export function buildHandoffSSE(opts: {
  fromAgent: string;
  toAgent: string;
  response: string;
}): string {
  const lines: string[] = [];
  lines.push(sseChunk({ type: "start" }));
  lines.push(sseChunk({ type: "start-step" }));
  lines.push(sseChunk({ type: "finish-step" }));

  lines.push(sseChunk({ type: "start-step" }));
  const handoffId = "text-handoff";
  lines.push(sseChunk({ type: "text-start", id: handoffId }));
  lines.push(
    sseChunk({
      type: "text-delta",
      id: handoffId,
      delta: `[Handed off from ${opts.fromAgent} to ${opts.toAgent}]\n\n`,
    }),
  );
  lines.push(sseChunk({ type: "text-end", id: handoffId }));

  const responseId = "text-response";
  lines.push(sseChunk({ type: "text-start", id: responseId }));
  lines.push(
    sseChunk({
      type: "text-delta",
      id: responseId,
      delta: opts.response,
    }),
  );
  lines.push(sseChunk({ type: "text-end", id: responseId }));
  lines.push(sseChunk({ type: "finish-step" }));
  lines.push(sseChunk({ type: "finish", finishReason: "stop" }));
  return lines.join("");
}

function sseChunk(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}
