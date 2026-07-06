"use client";

import { useState } from "react";
import type { ChatUIMessage } from "@/lib/useChatStream";

export function MessageBubble({ message }: { message: ChatUIMessage }) {
  const isUser = message.role === "user";
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveToObsidian() {
    setSaving(true);
    setError(null);
    try {
      const filename = `chat-note-${Date.now()}`;
      const res = await fetch("/api/obsidian/save-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, content: message.content, source: "chat" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-2xl rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${
          isUser ? "bg-indigo-600 text-white" : "bg-neutral-900 text-neutral-100 border border-neutral-800"
        }`}
      >
        {message.content || (isUser ? "" : "…")}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 pt-2 border-t border-neutral-800 flex flex-col gap-1">
            {message.citations.map((c, i) => (
              <div key={c.documentId + i} className="text-xs text-neutral-500">
                [{i + 1}] {c.title} — <span className="italic">{c.snippet}</span>
              </div>
            ))}
          </div>
        )}
        {!isUser && message.content && (
          <div className="mt-2 pt-2 border-t border-neutral-800 flex items-center gap-2">
            <button
              onClick={saveToObsidian}
              disabled={saving || saved}
              className="text-xs text-neutral-500 hover:text-neutral-300 disabled:text-neutral-600"
            >
              {saved ? "Saved to Obsidian" : saving ? "Saving…" : "Save to Obsidian"}
            </button>
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
