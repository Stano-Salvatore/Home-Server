"use client";

import { useState } from "react";
import type { ChatUIMessage } from "@/lib/useChatStream";
import { Markdown } from "./markdown";
import { ThinkingSpiral } from "@/components/ui/thinking-spiral";
import { SpeakButton } from "@/components/ui/speak-button";

function formatStats(durationMs: number, tokenCount: number): string {
  const seconds = durationMs / 1000;
  const tokPerSec = tokenCount / seconds;
  const time = seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
  return `${time} · ${tokPerSec.toFixed(1)} tok/s`;
}

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
      const citationSourcePaths = message.citations?.map((c) => c.sourcePath) ?? [];
      const res = await fetch("/api/obsidian/save-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, content: message.content, source: "chat", citationSourcePaths }),
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
        className={`max-w-2xl rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-accent text-black whitespace-pre-wrap"
            : "bg-[var(--surface)] text-ink border border-[var(--border)]"
        }`}
      >
        {isUser ? (
          message.content
        ) : message.content ? (
          <Markdown content={message.content} />
        ) : (
          <span className="text-accent inline-flex"><ThinkingSpiral /></span>
        )}
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
            <SpeakButton text={message.content} />
            {message.durationMs !== undefined && message.tokenCount !== undefined && (
              <span className="text-xs text-neutral-600" title={`${message.tokenCount} tokens`}>
                {formatStats(message.durationMs, message.tokenCount)}
              </span>
            )}
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
