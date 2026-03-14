import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToModelMessages,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { Runner, type StreamEvent, type AgentInstance } from "ai-sdk-agents";

/**
 * Bridges ai-sdk-agents Runner.stream() events into a UIMessageStream
 * response compatible with the AI SDK useChat hook.
 */
export function streamAgentResponse({
  agent,
  messages,
}: {
  agent: AgentInstance;
  messages: UIMessage[];
}): Response {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const write = (chunk: UIMessageChunk) => writer.write(chunk);
      const modelMessages = await convertToModelMessages(messages);
      const streamResult = Runner.stream(agent, modelMessages);

      let textPartId = "";
      let textStarted = false;
      let partCounter = 0;

      for await (const event of streamResult.events) {
        handleEvent(event, { write }, {
          getTextPartId: () => {
            if (!textPartId) {
              textPartId = `text-${partCounter++}`;
            }
            return textPartId;
          },
          isTextStarted: () => textStarted,
          setTextStarted: (v: boolean) => {
            textStarted = v;
          },
          resetTextPart: () => {
            textPartId = "";
          },
        });
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}

interface TextState {
  getTextPartId: () => string;
  isTextStarted: () => boolean;
  setTextStarted: (v: boolean) => void;
  resetTextPart: () => void;
}

function handleEvent(
  event: StreamEvent,
  writer: { write: (chunk: UIMessageChunk) => void },
  state: TextState,
) {
  switch (event.type) {
    case "agent_start":
      writer.write({ type: "start" });
      writer.write({ type: "start-step" });
      break;

    case "text_delta": {
      if (!state.isTextStarted()) {
        writer.write({ type: "text-start", id: state.getTextPartId() });
        state.setTextStarted(true);
      }
      writer.write({
        type: "text-delta",
        id: state.getTextPartId(),
        delta: event.delta,
      });
      break;
    }

    case "tool_call_start": {
      if (state.isTextStarted()) {
        writer.write({ type: "text-end", id: state.getTextPartId() });
        state.setTextStarted(false);
        state.resetTextPart();
      }
      const toolEvent = event as StreamEvent & {
        toolName: string;
        args: unknown;
      };
      writer.write({
        type: "tool-input-available",
        toolCallId: `call-${toolEvent.toolName}-${Date.now()}`,
        toolName: toolEvent.toolName,
        input: toolEvent.args,
      });
      break;
    }

    case "tool_call_end": {
      const toolResultEvent = event as StreamEvent & {
        toolName: string;
        output: unknown;
      };
      writer.write({
        type: "tool-output-available",
        toolCallId: `call-${toolResultEvent.toolName}-${Date.now()}`,
        output: toolResultEvent.output,
      });
      break;
    }

    case "handoff": {
      const handoffEvent = event as StreamEvent & {
        from: string;
        to: string;
      };
      if (state.isTextStarted()) {
        writer.write({ type: "text-end", id: state.getTextPartId() });
        state.setTextStarted(false);
        state.resetTextPart();
      }
      writer.write({ type: "finish-step" });
      writer.write({ type: "start-step" });

      const handoffPartId = `text-handoff-${Date.now()}`;
      writer.write({ type: "text-start", id: handoffPartId });
      writer.write({
        type: "text-delta",
        id: handoffPartId,
        delta: `[Handed off from ${handoffEvent.from} to ${handoffEvent.to}]\n\n`,
      });
      writer.write({ type: "text-end", id: handoffPartId });
      break;
    }

    case "agent_end":
      if (state.isTextStarted()) {
        writer.write({ type: "text-end", id: state.getTextPartId() });
        state.setTextStarted(false);
        state.resetTextPart();
      }
      writer.write({ type: "finish-step" });
      break;

    case "done":
      writer.write({ type: "finish", finishReason: "stop" });
      break;

    case "error": {
      const errorEvent = event as StreamEvent & { error: Error };
      writer.write({ type: "error", errorText: errorEvent.error.message });
      break;
    }
  }
}
