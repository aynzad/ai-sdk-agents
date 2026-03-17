/**
 * Build a mock UIMessageStream SSE body that simulates the stream
 * produced by ai-sdk-agents Runner.stream() → createUIMessageStreamResponse().
 *
 * The format matches the AI SDK v6 UIMessageStream protocol:
 * each line is `<type-code>:<json>\n`.
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

function sseChunk(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}
