/**
 * Build mock UIMessageStream SSE bodies that simulate the stream
 * produced by streamText().toUIMessageStreamResponse().
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
 * Build a mock SSE response that simulates the agent requesting
 * the updateRecord tool — a client-side tool without execute.
 * This triggers the approval dialog in the UI.
 */
export function buildToolCallSSE(opts: {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}): string {
  const lines: string[] = [];
  lines.push(sseChunk({ type: "start" }));
  lines.push(sseChunk({ type: "start-step" }));
  lines.push(
    sseChunk({
      type: "tool-input-available",
      toolCallId: opts.toolCallId,
      toolName: opts.toolName,
      input: opts.input,
    }),
  );
  lines.push(sseChunk({ type: "finish-step" }));
  lines.push(sseChunk({ type: "finish", finishReason: "stop" }));
  return lines.join("");
}

function sseChunk(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}
