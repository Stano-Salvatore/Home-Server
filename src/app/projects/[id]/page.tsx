"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "@/components/chat/model-picker";
import type { ChatBackend } from "@/lib/types";

type Project = { id: string; name: string; emoji: string | null; instructions: string | null };
type Conversation = { id: string; title: string; updatedAt: number };

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [memoryCount, setMemoryCount] = useState(0);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [instructions, setInstructions] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [model, setModel] = useState<{ backend: ChatBackend; modelId: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.project) return;
        setProject(d.project);
        setName(d.project.name);
        setEmoji(d.project.emoji ?? "");
        setInstructions(d.project.instructions ?? "");
        setConversations(d.conversations ?? []);
        setMemoryCount(d.memoryCount ?? 0);
      });
  }, [id]);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, emoji, instructions }),
      });
      const d = await res.json();
      if (d.project) {
        setProject(d.project);
        setSavedAt(Date.now());
      }
    } finally {
      setBusy(false);
    }
  }

  async function newChat() {
    if (!model) return;
    setBusy(true);
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backend: model.backend,
          modelId: model.modelId,
          projectId: id,
          systemPrompt: instructions || undefined,
          title: "New Chat",
        }),
      });
      const d = await res.json();
      if (d.conversation) router.push(`/chat/${d.conversation.id}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this project? Its chats are kept but detached; its memory is erased.")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    router.push("/projects");
  }

  if (!project) return <div className="p-8 text-ink-dim">Loading…</div>;

  return (
    <div className="p-8 max-w-3xl">
      <Link href="/projects" className="text-xs text-ink-dim hover:text-ink">
        ← all projects
      </Link>

      <div className="flex items-center gap-2 mt-3 mb-1">
        <span className="text-2xl">{emoji || "📁"}</span>
        <h1 className="text-xl font-semibold text-ink">{project.name}</h1>
      </div>
      <p className="text-sm text-ink-dim mb-6">
        Isolated workspace · {conversations.length} chat{conversations.length === 1 ? "" : "s"} ·{" "}
        {memoryCount} remembered exchange{memoryCount === 1 ? "" : "s"}
      </p>

      <Card className="p-5 flex flex-col gap-3 mb-6">
        <h2 className="text-sm font-semibold text-ink">Settings</h2>
        <div className="flex gap-2">
          <input
            className="w-16 rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink text-center focus:outline-none focus:border-accent"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="📁"
            maxLength={4}
          />
          <input
            className="flex-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <label className="text-xs text-ink-dim">Instructions (system prompt for every chat here)</label>
        <textarea
          className="rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent min-h-28"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          {savedAt && <span className="text-xs text-ink-dim">Saved.</span>}
          <span className="flex-1" />
          <Button variant="ghost" onClick={remove}>
            Delete project
          </Button>
        </div>
      </Card>

      <Card className="p-5 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ink">Chats</h2>
        <div className="flex items-center gap-2">
          <ModelPicker value={model} onChange={(v) => setModel(v)} />
          <Button onClick={newChat} disabled={busy || !model}>
            + New chat in this project
          </Button>
        </div>
        {conversations.length === 0 ? (
          <p className="text-sm text-ink-dim">No chats yet. Start one above.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  className="block rounded-md px-3 py-2 text-sm text-ink-dim hover:text-ink hover:bg-[var(--surface-2)] truncate"
                >
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
