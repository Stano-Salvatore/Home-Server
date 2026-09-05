"use client";

import { useState } from "react";
import { BookMarked } from "lucide-react";

// "Save this conversation as a book note."
//
// Two steps on purpose: the model reads the whole conversation and proposes a
// title, an author and the note, and only writes it once the proposal has been
// seen. It is guessing which book was meant and where to file it, and a wrong
// guess would leave a stray note in a vault of real reading notes. The title
// and author stay editable for exactly that reason.

type Draft = { title: string; author: string; year?: string; notes: string };

export function BookNoteButton({ conversationId }: { conversationId: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function propose() {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/obsidian/book-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDraft(data.draft as Draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/obsidian/book-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSaved(
        data.created
          ? `Saved as ${draft.author}/${draft.title}`
          : `Added a dated section to the existing note for ${draft.title}`,
      );
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => void propose()}
        disabled={busy}
        title="Read this whole conversation and write a note about the book into the vault"
        className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs text-ink-dim hover:text-ink disabled:opacity-50"
        style={{ borderColor: "var(--border)" }}
      >
        <BookMarked size={13} />
        {busy && !draft ? "reading…" : "book note"}
      </button>

      {draft && (
        <div
          className="absolute right-4 top-14 z-20 w-[min(30rem,calc(100vw-2rem))] rounded-xl border p-4 shadow-lg"
          style={{ background: "var(--surface)", borderColor: "var(--accent)" }}
        >
          <p className="mb-3 text-xs text-ink-dim">
            Check the book before it goes into the vault. An existing note is never
            overwritten — a dated section gets added instead.
          </p>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-ink-dim">Book</label>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className="mb-2 w-full rounded border bg-transparent px-2 py-1 text-sm text-ink"
            style={{ borderColor: "var(--border)" }}
          />
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-ink-dim">Author</label>
          <input
            value={draft.author}
            onChange={(e) => setDraft({ ...draft, author: e.target.value })}
            className="mb-2 w-full rounded border bg-transparent px-2 py-1 text-sm text-ink"
            style={{ borderColor: "var(--border)" }}
          />
          <div
            className="mb-3 max-h-52 overflow-y-auto whitespace-pre-wrap rounded border px-2 py-1.5 text-xs text-ink-dim"
            style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
          >
            {draft.notes}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void save()}
              disabled={busy || !draft.title.trim() || !draft.author.trim()}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save to vault"}
            </button>
            <button
              onClick={() => setDraft(null)}
              disabled={busy}
              className="rounded-lg border px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
              style={{ borderColor: "var(--border)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {saved && <span className="text-xs text-term-green">{saved}</span>}
      {error && <span className="text-xs text-term-red">{error}</span>}
    </>
  );
}
