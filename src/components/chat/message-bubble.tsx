"use client";

import { useState } from "react";
import type { ChatUIMessage } from "@/lib/useChatStream";
import { Markdown } from "./markdown";
import { ThinkingSpiral } from "@/components/ui/thinking-spiral";
import { SpeakButton } from "@/components/ui/speak-button";
import { Brain } from "lucide-react";

function formatStats(durationMs: number, tokenCount: number): string {
  const seconds = durationMs / 1000;
  const tokPerSec = tokenCount / seconds;
  const time = seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
  return `${tokenCount} tok · ${time} · ${tokPerSec.toFixed(1)} tok/s`;
}

// "qwen3:14b @ ryzen" — node-qualified label for a chat route, matching the
// server's describeRoute so the fallback chip and the status line agree.
function routeLabel(r: { modelId: string; nodeName?: string }): string {
  const sep = r.modelId.indexOf("::");
  const tag = sep === -1 ? r.modelId : r.modelId.slice(sep + 2);
  return r.nodeName ? tag + " @ " + r.nodeName : tag;
}

function formatTime(epochMs?: number): string | null {
  if (!epochMs) return null;
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * A first guess at what this note should be called: a leading markdown
 * heading if the reply has one, otherwise its opening sentence, trimmed to
 * something that reads as a title in the vault's file list. Only a
 * suggestion — it lands in an editable field, because the person saving
 * knows what they'll search for later.
 */
function suggestNoteTitle(content: string): string {
  const heading = content.match(/^\s*#{1,3}\s+(.+)$/m)?.[1];
  const raw =
    heading ??
    content
      .replace(/^[\s>*_#-]+/, "")
      .split(/(?<=[.!?])\s|\n/)[0] ??
    "";
  const cleaned = raw
    .replace(/[*_`[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= 60) return cleaned;
  // Cut at a word boundary rather than mid-word.
  return cleaned.slice(0, 60).replace(/\s+\S*$/, "");
}

/** Strip what a filename can't carry, keeping accents — this vault is Czech. */
function safeNoteName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|#^[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
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
  const [showThinking, setShowThinking] = useState(false);
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState("");
  const [savedAs, setSavedAs] = useState<string | null>(null);
  const time = formatTime(message.createdAt);

  function beginSave() {
    setTitle(suggestNoteTitle(message.content));
    setNaming(true);
    setError(null);
  }

  async function saveToObsidian() {
    const filename = safeNoteName(title) || `chat-note-${Date.now()}`;
    setSaving(true);
    setError(null);
    try {
      const citationSourcePaths = message.citations?.map((c) => c.sourcePath) ?? [];
      const res = await fetch("/api/obsidian/save-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, content: message.content, source: "chat", citationSourcePaths }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaved(true);
      setNaming(false);
      setSavedAs(filename);
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

        {/* Reasoning, when this conversation has thinking on. It sits above
            the answer, collapsed once the answer exists — worth being able to
            check, not worth reading every time. */}
        {!isUser && message.thinking && (
          <div className="mb-2">
            <button
              onClick={() => setShowThinking((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-ink-dim hover:text-ink"
            >
              <Brain size={12} />
              {showThinking ? "hide reasoning" : `reasoning (${message.thinking.length} chars)`}
            </button>
            {showThinking && (
              <div
                className="mt-1.5 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border px-3 py-2 text-xs text-ink-dim"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              >
                {message.thinking}
              </div>
            )}
          </div>
        )}

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
            {message.via?.fallbackFrom && (
              <span
                className="text-[11px] text-ink-dim"
                title={"Requested " + routeLabel(message.via.fallbackFrom) + ", which was unreachable when this reply was generated."}
              >
                ⚠ answered by {routeLabel(message.via)} (fallback)
              </span>
            )}
            <span className="ml-auto flex items-center gap-2">
              <button
                onClick={saved ? undefined : naming ? () => setNaming(false) : beginSave}
                disabled={saving || saved}
                title={savedAs ? `Saved as ${savedAs}.md` : undefined}
                className="text-xs text-ink-dim hover:text-ink disabled:opacity-50"
              >
                {saved
                  ? `Saved as ${savedAs}`
                  : saving
                    ? "Saving…"
                    : naming
                      ? "Cancel"
                      : "Save to Obsidian"}
              </button>
              <SpeakButton text={message.content} />
            </span>
            {naming && !saved && (
              <span className="mt-1 flex w-full items-center gap-2">
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveToObsidian();
                    if (e.key === "Escape") setNaming(false);
                  }}
                  placeholder="Note name…"
                  aria-label="Name for the new Obsidian note"
                  className="flex-1 rounded border bg-transparent px-2 py-1 text-xs text-ink placeholder:text-ink-dim focus:outline-none"
                  style={{ borderColor: "var(--border)" }}
                />
                <button
                  onClick={() => void saveToObsidian()}
                  disabled={saving || title.trim() === ""}
                  className="rounded bg-accent px-2 py-1 text-xs font-medium text-black disabled:opacity-40"
                >
                  Save
                </button>
              </span>
            )}
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
