"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Fact = { id: string; content: string; category: string | null };
type ChatMem = { bytes: number; turns: number; capBytes: number };

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function MemoryTab() {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [newContent, setNewContent] = useState("");
  const [adding, setAdding] = useState(false);
  const [chatMem, setChatMem] = useState<ChatMem | null>(null);

  function refresh() {
    fetch("/api/brain/memory")
      .then((r) => r.json())
      .then((data) => setFacts(data.facts ?? []));
  }

  useEffect(() => {
    refresh();
    fetch("/api/brain/chat-memory")
      .then((r) => r.json())
      .then((d) => setChatMem(d));
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

  const pct = chatMem ? Math.min(100, (chatMem.bytes / chatMem.capBytes) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      {chatMem && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-ink">Auto-recall memory</span>
            <span className="text-xs text-ink-dim">
              {fmtBytes(chatMem.bytes)} / {fmtBytes(chatMem.capBytes)} · {chatMem.turns} exchange
              {chatMem.turns === 1 ? "" : "s"}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--color-accent)" }} />
          </div>
          <p className="text-xs text-ink-dim mt-2">
            Every chat is embedded automatically so agents recall past conversations. When the cap
            fills, the oldest exchanges drop first. Project chats stay isolated to their project.
          </p>
        </Card>
      )}

      <p className="text-sm text-neutral-500">
        <span className="text-ink font-medium">Pinned facts</span> below are included in{" "}
        <em>every</em> conversation&apos;s context — use them for things the agent should always know.
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
