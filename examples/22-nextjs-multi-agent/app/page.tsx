"use client";

import { useChat } from "@ai-sdk/react";
import { isToolUIPart, getToolName } from "ai";
import { useState } from "react";

export default function MultiAgentPage() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat();

  return (
    <div className="flex flex-col h-dvh max-w-2xl mx-auto">
      <header className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h1 className="text-lg font-semibold">✈️ Airline Customer Service</h1>
        <p className="text-sm text-zinc-500">
          Multi-agent system with FAQ and Booking specialists
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
            <p>Welcome! How can we help you today?</p>
            <div className="flex gap-2 flex-wrap justify-center mt-2">
              <SuggestionChip
                text="What's the baggage policy?"
                onClick={(t) => {
                  setInput(t);
                }}
              />
              <SuggestionChip
                text="I'd like to change my seat"
                onClick={(t) => {
                  setInput(t);
                }}
              />
              <SuggestionChip
                text="How do I get a refund?"
                onClick={(t) => {
                  setInput(t);
                }}
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
                if (isToolUIPart(part)) {
                  const toolName = getToolName(part);
                  const hasOutput = "output" in part && part.output != null;
                  return (
                    <div
                      key={`${message.id}-${i}`}
                      data-testid="tool-call"
                      className="mt-2 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-700 text-xs font-mono"
                    >
                      <span className="text-blue-500 dark:text-blue-400">
                        🔧 {toolName}
                      </span>
                      {hasOutput ? (
                        <pre className="mt-1 text-zinc-600 dark:text-zinc-300 overflow-x-auto">
                          {JSON.stringify(part.output, null, 2)}
                        </pre>
                      ) : (
                        <span className="ml-2 text-zinc-400">running…</span>
                      )}
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
          placeholder="Ask about baggage, seats, refunds…"
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
