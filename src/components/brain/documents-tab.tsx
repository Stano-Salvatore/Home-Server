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

export function DocumentsTab() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [chunks, setChunks] = useState<{ id: string; chunkIndex: number; content: string }[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [adding, setAdding] = useState(false);

  function refresh() {
    fetch("/api/brain/documents")
      .then((r) => r.json())
      .then((data) => setDocuments(data.documents ?? []));
  }

  useEffect(() => {
    refresh();
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
        <h3 className="text-sm font-semibold text-neutral-200 mb-2">Add a note manually</h3>
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
