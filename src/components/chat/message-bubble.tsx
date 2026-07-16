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
  return `${tokenCount} tok · ${time} · ${tokPerSec.toFixed(1)} tok/s`;
}

function formatTime(epochMs?: number): string | null {
  if (!epochMs) return null;
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Odysseus-style message cards: full cards with a "● You / ✦ model" header
// row and, on replies, a mono stats footer — instead of chat bubbles.
export function MessageBubble({
  message,
  modelLabel,
}: {
  message: ChatUIMessage;
  modelLabel?: string;
}) {
  const isUser = message.role === "user";
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);
  const time = formatTime(message.createdAt);

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
        className={`rounded-lg px-4 py-3 text-sm leading-relaxed border ${
          isUser ? "max-w-xl" : "max-w-2xl w-full"
        }`}
        style={{
          background: isUser ? "var(--surface)" : "var(--bg)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex items-baseline gap-2 mb-1.5 text-xs">
          {isUser ? (
            <span className="text-ink-dim">
              <span className="text-accent">●</span> You
            </span>
          ) : (
            <span className="text-accent">✦ {modelLabel ?? "assistant"}</span>
          )}
          {time && <span className="text-ink-dim opacity-60">{time}</span>}
        </div>

        {isUser ? (
          <span className="whitespace-pre-wrap text-ink">{message.content}</span>
        ) : message.content ? (
          <Markdown content={message.content} />
        ) : (
          <div
            className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-accent"
            style={{ background: "rgba(224, 108, 117, 0.08)" }}
          >
            <ThinkingSpiral />
            <span>{message.status ?? "thinking…"}</span>
          </div>
        )}

        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={() => setShowSources((s) => !s)}
              className="text-xs text-ink-dim hover:text-ink"
            >
              {showSources
                ? "Hide sources"
                : `${message.citations.length} source${message.citations.length === 1 ? "" : "s"}`}
            </button>
            {showSources && (
              <div className="mt-1.5 flex flex-col gap-1.5">
                {message.citations.map((c, i) => (
                  <div
                    key={c.documentId + i}
                    className="rounded border px-2 py-1.5"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="text-xs" style={{ color: "var(--color-steel)" }}>
                      [{i + 1}] {c.title}
                    </div>
                    {c.snippet && (
                      <div className="mt-0.5 text-xs text-ink-dim italic">{c.snippet}</div>
                    )}
                    <div className="mt-0.5 text-[10px] text-ink-dim opacity-60 truncate">
                      {c.sourcePath}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!isUser && message.content && (
          <div
            className="mt-2 pt-2 border-t flex items-center gap-3"
            style={{ borderColor: "var(--border)" }}
          >
            {message.durationMs !== undefined && message.tokenCount !== undefined && (
              <span className="text-[11px] text-ink-dim">
                {formatStats(message.durationMs, message.tokenCount)}
              </span>
            )}
            <span className="ml-auto flex items-center gap-2">
              <button
                onClick={saveToObsidian}
                disabled={saving || saved}
                className="text-xs text-ink-dim hover:text-ink disabled:opacity-50"
              >
                {saved ? "Saved to Obsidian" : saving ? "Saving…" : "Save to Obsidian"}
              </button>
              <SpeakButton text={message.content} />
            </span>
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
