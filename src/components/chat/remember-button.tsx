"use client";

import { useState } from "react";
import { ThumbsUp } from "lucide-react";

// "That was good — keep it."
//
// Memory facts are injected into every conversation, for every agent, on every
// turn. That makes them powerful and expensive in equal measure: a paragraph
// saved here is a paragraph Athena, Alice and Hermes all carry for the rest of
// time. So the button does not save the reply — it opens the reply, trimmed to
// a line, for editing into the fact worth keeping.

function distil(text: string): string {
  const clean = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // First sentence or two, up to a length that stays cheap to carry around.
  const sentences = clean.split(/(?<=[.!?])\s+/);
  let out = "";
  for (const s of sentences) {
    if ((out + " " + s).trim().length > 220) break;
    out = (out + " " + s).trim();
  }
  return out || clean.slice(0, 220);
}

export function RememberButton({ text }: { text: string }) {
  const [editing, setEditing] = useState(false);
  const [fact, setFact] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const content = fact.trim();
    if (!content) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/brain/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, source: "agent" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setSaved(true);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (saved) return <span className="text-xs text-term-green">remembered</span>;

  return (
    <>
      <button
        onClick={() => {
          setFact(distil(text));
          setEditing((v) => !v);
        }}
        title="Keep this — every agent will carry it from now on"
        className="text-ink-dim hover:text-term-green"
      >
        <ThumbsUp size={13} />
      </button>

      {editing && (
        <span className="mt-1 flex w-full flex-col gap-1.5">
          <textarea
            autoFocus
            value={fact}
            onChange={(e) => setFact(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
              if (e.key === "Escape") setEditing(false);
            }}
            rows={2}
            placeholder="What is worth remembering from this?"
            className="w-full resize-none rounded border bg-transparent px-2 py-1 text-xs text-ink"
            style={{ borderColor: "var(--border)" }}
          />
          <span className="flex items-center gap-2">
            <button
              onClick={() => void save()}
              disabled={busy || !fact.trim()}
              className="rounded bg-accent px-2 py-1 text-xs font-medium text-black disabled:opacity-40"
            >
              {busy ? "Saving…" : "Remember"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs text-ink-dim hover:text-ink"
            >
              Cancel
            </button>
            <span className="text-[10px] text-ink-dim">every agent will see this</span>
          </span>
          {error && <span className="text-xs text-term-red">{error}</span>}
        </span>
      )}
    </>
  );
}
