"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import { useChatStream } from "@/lib/useChatStream";
import { MessageBubble } from "@/components/chat/message-bubble";
import { Button } from "@/components/ui/button";
import { Send, Square } from "lucide-react";

type Conversation = {
  id: string;
  title: string;
  backend: string;
  modelId: string;
  ragEnabled: boolean;
  wikiEnabled: boolean;
};

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const { messages, streaming, error, send, stop, loadHistory } = useChatStream(id);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/chat/conversations/${id}`)
      .then((r) => r.json())
      .then((data) => setConversation(data.conversation));
    loadHistory(id);
  }, [id, loadHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function toggle(patch: Partial<Conversation>) {
    if (!conversation) return;
    const res = await fetch(`/api/chat/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    setConversation(data.conversation);
  }

  function handleSend() {
    const content = input.trim();
    if (!content || streaming) return;
    setInput("");
    void send(content);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="text-sm text-ink-dim truncate">
          {conversation ? (
            <>
              <span className="text-accent">[{conversation.backend}]</span> {conversation.modelId}
            </>
          ) : (
            "Loading…"
          )}
        </div>
        {conversation && (
          <div className="flex items-center gap-4 shrink-0">
            <label className="flex items-center gap-1.5 text-xs text-ink-dim">
              <input
                type="checkbox"
                checked={conversation.ragEnabled}
                onChange={() => toggle({ ragEnabled: !conversation.ragEnabled })}
              />
              Brain
            </label>
            <label className="flex items-center gap-1.5 text-xs text-ink-dim">
              <input
                type="checkbox"
                checked={conversation.wikiEnabled}
                onChange={() => toggle({ wikiEnabled: !conversation.wikiEnabled })}
              />
              Wikipedia
            </label>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-600">Say something to get started.</p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-5 text-xs text-red-400">{error}</p>}

      <div className="border-t border-neutral-900 p-4 flex gap-2">
        <textarea
          className="flex-1 resize-none rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent"
          rows={2}
          placeholder="Message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        {streaming ? (
          <Button variant="danger" onClick={stop}>
            <Square size={14} /> Stop
          </Button>
        ) : (
          <Button onClick={handleSend} disabled={!input.trim()}>
            <Send size={14} /> Send
          </Button>
        )}
      </div>
    </div>
  );
}
