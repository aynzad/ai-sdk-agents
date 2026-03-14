/**
 * Build mock UIMessageStream SSE bodies.
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
 * Build a mock SSE response that simulates a guardrail trip error.
 * The error chunk causes useChat to set the `error` state.
 */
export function buildGuardrailErrorSSE(errorMessage: string): string {
  const lines: string[] = [];
  lines.push(sseChunk({ type: "error", errorText: errorMessage }));
  return lines.join("");
}

function sseChunk(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}
