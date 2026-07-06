"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Hit = { documentId: string; title: string; sourcePath: string; content: string; score: number };

export function SearchTab() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/brain/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setHits(data.hits ?? []);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded bg-neutral-950 border border-neutral-800 px-3 py-1.5 text-sm"
          placeholder="Search your notes, library, and files…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <Button onClick={search} disabled={loading || !query.trim()}>
          {loading ? "Searching…" : "Search"}
        </Button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {searched && hits.length === 0 && !error && (
        <p className="text-sm text-neutral-500">No matches.</p>
      )}

      <div className="flex flex-col gap-2">
        {hits.map((h, i) => (
          <Card key={h.documentId + i} className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-neutral-100">{h.title}</span>
              <span className="text-xs text-neutral-500">{h.score.toFixed(3)}</span>
            </div>
            <p className="text-xs text-neutral-400 whitespace-pre-wrap">{h.content}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
