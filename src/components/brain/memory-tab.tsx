"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Fact = { id: string; content: string; category: string | null };

export function MemoryTab() {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [newContent, setNewContent] = useState("");
  const [adding, setAdding] = useState(false);

  function refresh() {
    fetch("/api/brain/memory")
      .then((r) => r.json())
      .then((data) => setFacts(data.facts ?? []));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function add() {
    if (!newContent.trim()) return;
    setAdding(true);
    try {
      await fetch("/api/brain/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent }),
      });
      setNewContent("");
      refresh();
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    await fetch("/api/brain/memory", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-500">
        These facts are included in every conversation&apos;s context, so the agent remembers them
        across chats.
      </p>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded bg-neutral-950 border border-neutral-800 px-3 py-1.5 text-sm"
          placeholder="e.g. I prefer concise answers"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button onClick={add} disabled={adding || !newContent.trim()}>
          Add
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {facts.length === 0 && <p className="text-sm text-neutral-500">No memory facts yet.</p>}
        {facts.map((f) => (
          <Card key={f.id} className="p-3 flex items-center justify-between">
            <span className="text-sm text-neutral-100">{f.content}</span>
            <Button variant="danger" onClick={() => remove(f.id)}>
              Delete
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
