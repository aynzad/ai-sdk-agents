"use client";

import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useState } from "react";

interface UpdateRecordInput {
  id: string;
  field: string;
  value: string;
}

export default function HumanInTheLoopPage() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, addToolOutput, status } = useChat({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  return (
    <div className="flex flex-col h-dvh max-w-2xl mx-auto">
      <header className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h1 className="text-lg font-semibold">🔒 Human-in-the-Loop</h1>
        <p className="text-sm text-zinc-500">
          Tool calls require your approval before executing
        </p>
      </header>

      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        data-testid="messages"
      >
        {messages.length === 0 && (
          <div
            className="flex flex-col items-center justify-center h-full text-zinc-400 gap-2"
            data-testid="empty-state"
          >
            <p>Try asking me to look up or update a database record.</p>
            <div className="flex gap-2 flex-wrap justify-center mt-2">
              <SuggestionChip
                text="Look up record #123"
                onClick={(t) => setInput(t)}
              />
              <SuggestionChip
                text="Update the email for record #123"
                onClick={(t) => setInput(t)}
              />
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              data-testid={`message-${message.role}`}
              className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                message.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-200 dark:bg-zinc-800"
              }`}
            >
              {message.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <p
                      key={`${message.id}-${i}`}
                      className="whitespace-pre-wrap"
                    >
                      {part.text}
                    </p>
                  );
                }

                if (part.type === "tool-getRecord") {
                  if (
                    part.state === "input-available" ||
                    part.state === "output-available"
                  ) {
                    return (
                      <div
                        key={`${message.id}-${i}`}
                        className="mt-2 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-700 text-xs font-mono"
                        data-testid="tool-getRecord"
                      >
                        <span className="text-green-600 dark:text-green-400">
                          📋 getRecord
                        </span>
                        {part.state === "output-available" && (
                          <pre className="mt-1 text-zinc-600 dark:text-zinc-300 overflow-x-auto">
                            {JSON.stringify(part.output, null, 2)}
                          </pre>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={`${message.id}-${i}`}
                      className="mt-2 text-xs text-zinc-400"
                    >
                      Looking up record…
                    </div>
                  );
                }

                if (part.type === "tool-updateRecord") {
                  const callId = part.toolCallId;

                  if (part.state === "input-available") {
                    const input = part.input as UpdateRecordInput;
                    return (
                      <div
                        key={`${message.id}-${i}`}
                        data-testid="approval-card"
                        className="mt-2 p-3 rounded-xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950"
                      >
                        <p className="font-semibold text-amber-700 dark:text-amber-400 mb-2">
                          ⚠️ Approval Required
                        </p>
                        <div className="text-sm space-y-1 mb-3">
                          <p>
                            <span className="font-medium">Tool:</span>{" "}
                            updateRecord
                          </p>
                          <p>
                            <span className="font-medium">Record:</span>{" "}
                            {input.id}
                          </p>
                          <p>
                            <span className="font-medium">Field:</span>{" "}
                            {input.field}
                          </p>
                          <p>
                            <span className="font-medium">New Value:</span>{" "}
                            {input.value}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            data-testid="approve-button"
                            onClick={() => {
                              void addToolOutput({
                                tool: "updateRecord",
                                toolCallId: callId,
                                output: JSON.stringify({
                                  success: true,
                                  message: `Updated ${input.field} to "${input.value}" for record ${input.id}`,
                                }),
                              });
                            }}
                            className="px-3 py-1 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
                          >
                            ✓ Approve
                          </button>
                          <button
                            data-testid="reject-button"
                            onClick={() => {
                              void addToolOutput({
                                tool: "updateRecord",
                                toolCallId: callId,
                                output: JSON.stringify({
                                  success: false,
                                  message:
                                    "Update rejected by user. Do not proceed.",
                                }),
                              });
                            }}
                            className="px-3 py-1 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
                          >
                            ✗ Reject
                          </button>
                        </div>
                      </div>
                    );
                  }

                  if (part.state === "output-available") {
                    const output = JSON.parse(part.output as string) as Record<
                      string,
                      unknown
                    >;
                    return (
                      <div
                        key={`${message.id}-${i}`}
                        data-testid="approval-result"
                        className={`mt-2 p-2 rounded-lg text-sm ${
                          output.success
                            ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400"
                            : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400"
                        }`}
                      >
                        {output.success ? "✓" : "✗"} {output.message as string}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`${message.id}-${i}`}
                      className="mt-2 text-xs text-zinc-400"
                    >
                      Waiting for approval…
                    </div>
                  );
                }

                return null;
              })}
            </div>
          </div>
        ))}

        {status === "submitted" && (
          <div className="flex justify-start" data-testid="loading">
            <div className="bg-zinc-200 dark:bg-zinc-800 rounded-2xl px-4 py-2 text-zinc-500">
              Thinking…
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && status === "ready") {
            void sendMessage({ text: input });
            setInput("");
          }
        }}
        className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex gap-2"
      >
        <input
          data-testid="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask to look up or update a record…"
          disabled={status !== "ready"}
          className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          data-testid="send-button"
          type="submit"
          disabled={status !== "ready" || !input.trim()}
          className="rounded-xl bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function SuggestionChip({
  text,
  onClick,
}: {
  text: string;
  onClick: (text: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(text)}
      className="px-3 py-1 rounded-full border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
    >
      {text}
    </button>
  );
}
