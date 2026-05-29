"use client";

import { useEffect, useRef, useState } from "react";
import { SendIcon, XIcon } from "./icons";
import type { AssistantMessage, BriefState } from "./types";

type AssistantPanelProps = {
  brief: BriefState;
  sessionId: string | null;
  onClose: () => void;
  onApply: (brief: BriefState) => void;
  onSessionIdChange: (sessionId: string) => void;
};

export function AssistantPanel({
  brief,
  sessionId,
  onClose,
  onApply,
  onSessionIdChange,
}: AssistantPanelProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: "greeting",
      role: "assistant",
      content: "Hi! Tell me about your idea and I'll help develop it into a stronger brief.",
    },
  ]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isStreaming]);

  const sendMessage = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isStreaming) return;

    const assistantMessageId = crypto.randomUUID();
    setInput("");
    setError(null);
    setIsStreaming(true);
    setMessages((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmedInput,
      },
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
      },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          message: trimmedInput,
          briefContext: brief,
        }),
      });

      const nextSessionId = response.headers.get("x-session-id");
      if (nextSessionId) {
        onSessionIdChange(nextSessionId);
      }

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Assistant response failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        setMessages((items) =>
          items.map((item) =>
            item.id === assistantMessageId
              ? {
                  ...item,
                  content: item.content + chunk,
                }
              : item,
          ),
        );
      }
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Assistant response failed.";
      setError(message);
      setMessages((items) =>
        items.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: "I couldn't respond just now. Please try again.",
              }
            : item,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const applySuggestion = async () => {
    if (!sessionId || isApplying) {
      setError("Send at least one assistant message before applying to the brief.");
      return;
    }

    setError(null);
    setIsApplying(true);

    try {
      const response = await fetch("/api/apply-to-brief", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      });
      const data = (await response.json()) as {
        theme?: string;
        rawMaterial?: string;
        additionalContext?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not apply the assistant conversation.");
      }

      onApply({
        ...brief,
        theme: data.theme ?? brief.theme,
        rawMaterial: data.rawMaterial ?? brief.rawMaterial,
        additionalContext: data.additionalContext ?? brief.additionalContext,
      });
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not apply the assistant conversation.";
      setError(message);
    } finally {
      setIsApplying(false);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendMessage();
  };

  return (
    <aside className="flex h-full w-full flex-col border-l border-line bg-white lg:w-[360px]">
      <div className="flex h-16 items-center justify-between border-b border-line px-5">
        <h2 className="text-sm font-semibold text-ink">AI Assistant</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close assistant"
          className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-ink"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`whitespace-pre-wrap rounded-lg px-3 py-3 text-sm leading-6 ${
              message.role === "user"
                ? "ml-8 rounded-tr-sm bg-ink text-white"
                : "mr-8 rounded-tl-sm bg-slate-100 text-slate-800"
            }`}
          >
            {message.content || "Thinking..."}
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      <div className="border-t border-line p-4">
        {error ? (
          <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
        <form
          onSubmit={handleSubmit}
          className="mb-3 flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2"
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Type here..."
            disabled={isStreaming}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            aria-label="Send message"
            className="rounded-md bg-ink p-2 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </form>
        <button
          type="button"
          onClick={applySuggestion}
          disabled={isApplying}
          className="h-10 w-full rounded-md border border-line bg-slate-50 text-sm font-semibold text-ink transition hover:border-slate-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isApplying ? "Applying..." : "Apply to Brief"}
        </button>
      </div>
    </aside>
  );
}
