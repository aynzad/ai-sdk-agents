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
 *
 * When a guardrail trips, Runner.stream() emits an `error` event with
 * a GuardrailTripwiredError, which is forwarded as an error chunk to the client.
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
        handleEvent(
          event,
          { write },
          {
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
          },
        );
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
