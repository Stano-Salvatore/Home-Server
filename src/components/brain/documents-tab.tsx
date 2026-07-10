"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Document = {
  id: string;
  sourceType: string;
  sourcePath: string;
  title: string;
  indexedAt: number;
};
type Scope = { id: string; label: string; color: string; emoji?: string };

export function DocumentsTab() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [chunks, setChunks] = useState<{ id: string; chunkIndex: number; content: string }[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [adding, setAdding] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [rescanMsg, setRescanMsg] = useState<string | null>(null);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [members, setMembers] = useState<Record<string, string[]>>({});

  function refresh() {
    fetch("/api/brain/documents")
      .then((r) => r.json())
      .then((data) => setDocuments(data.documents ?? []));
  }

  function refreshScopes() {
    fetch("/api/brain/scopes")
      .then((r) => r.json())
      .then((d) => {
        setScopes(d.scopes ?? []);
        setMembers(d.members ?? {});
      });
  }

  const scopesOf = (docId: string) => scopes.filter((s) => members[s.id]?.includes(docId));

  async function toggleScope(docId: string, scopeId: string, add: boolean) {
    const current = scopes.filter((s) => members[s.id]?.includes(docId)).map((s) => s.id);
    const next = add ? [...current, scopeId] : current.filter((id) => id !== scopeId);
    setMembers((prev) => {
      const m: Record<string, string[]> = {};
      for (const s of scopes) {
        const has = next.includes(s.id);
        const list = new Set(prev[s.id] ?? []);
        if (has) list.add(docId);
        else list.delete(docId);
        m[s.id] = [...list];
      }
      return m;
    });
    await fetch("/api/brain/scopes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId, scopeIds: next }),
    });
  }

  async function rescanVault() {
    setRescanning(true);
    setRescanMsg(null);
    try {
      const res = await fetch("/api/obsidian/rescan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rescan failed");
      setRescanMsg(`Vault rescanned — ${data.indexed} of ${data.total} notes updated.`);
      refresh();
    } catch (err) {
      setRescanMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setRescanning(false);
    }
  }

  useEffect(() => {
    refresh();
    refreshScopes();
  }, []);

  async function toggleExpand(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    const res = await fetch(`/api/brain/documents/${id}/chunks`);
    const data = await res.json();
    setChunks(data.chunks ?? []);
  }

  async function addDocument() {
    if (!title.trim() || !content.trim()) return;
    setAdding(true);
    try {
      await fetch("/api/brain/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      setTitle("");
      setContent("");
      refresh();
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    await fetch("/api/brain/documents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (expanded === id) setExpanded(null);
    refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">Obsidian vault</h3>
            <p className="text-xs text-ink-dim mt-0.5">
              Re-index your vault after editing notes on-device (Android storage doesn&apos;t always
              notify automatically).
            </p>
          </div>
          <Button variant="secondary" onClick={rescanVault} disabled={rescanning}>
            {rescanning ? "Rescanning…" : "Rescan vault"}
          </Button>
        </div>
        {rescanMsg && <p className="text-xs text-ink-dim mt-2">{rescanMsg}</p>}
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-ink mb-2">Add a note manually</h3>
        <div className="flex flex-col gap-2">
          <input
            className="rounded bg-neutral-950 border border-neutral-800 px-2 py-1.5 text-sm"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="rounded bg-neutral-950 border border-neutral-800 px-2 py-1.5 text-sm"
            rows={4}
            placeholder="Content to index…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div>
            <Button onClick={addDocument} disabled={adding || !title.trim() || !content.trim()}>
              {adding ? "Indexing…" : "Add & index"}
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-2">
        {documents.length === 0 && (
          <p className="text-sm text-neutral-500">Nothing indexed yet.</p>
        )}
        {documents.map((doc) => (
          <Card key={doc.id} className="p-3">
            <div className="flex items-center justify-between">
              <button
                className="text-left flex-1 text-sm text-neutral-100"
                onClick={() => toggleExpand(doc.id)}
              >
                {doc.title}
              </button>
              <div className="flex items-center gap-2">
                <Badge color="neutral">{doc.sourceType}</Badge>
                <Button variant="danger" onClick={() => remove(doc.id)}>
                  Delete
                </Button>
              </div>
            </div>
            {scopes.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {scopesOf(doc.id).map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                    style={{ borderColor: s.color, color: "var(--ink)" }}
                  >
                    {s.emoji ?? "◆"} {s.label}
                    <button onClick={() => toggleScope(doc.id, s.id, false)} className="text-ink-dim hover:text-accent">×</button>
                  </span>
                ))}
                <select
                  className="rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-2 py-0.5 text-[11px] text-ink-dim focus:outline-none focus:border-accent"
                  value=""
                  onChange={(e) => e.target.value && toggleScope(doc.id, e.target.value, true)}
                  title="Add this document to a scope"
                >
                  <option value="">＋ scope</option>
                  {scopes
                    .filter((s) => !members[s.id]?.includes(doc.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>{s.emoji ?? "◆"} {s.label}</option>
                    ))}
                </select>
              </div>
            )}
            {expanded === doc.id && (
              <div className="mt-3 flex flex-col gap-2 border-t border-neutral-800 pt-3">
                {chunks.map((c) => (
                  <div key={c.id} className="text-xs text-neutral-400 bg-neutral-950 rounded p-2">
                    <span className="text-neutral-600">chunk {c.chunkIndex}</span>
                    <p className="mt-1 whitespace-pre-wrap">{c.content}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
