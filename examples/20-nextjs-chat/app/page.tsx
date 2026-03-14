"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat();

  return (
    <div className="flex flex-col h-dvh max-w-2xl mx-auto">
      <header className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h1 className="text-lg font-semibold">AI Chat</h1>
        <p className="text-sm text-zinc-500">Powered by ai-sdk-agents</p>
      </header>

      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        data-testid="messages"
      >
        {messages.length === 0 && (
          <div
            className="flex items-center justify-center h-full text-zinc-400"
            data-testid="empty-state"
          >
            Send a message to start the conversation.
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
          placeholder="Say something…"
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
