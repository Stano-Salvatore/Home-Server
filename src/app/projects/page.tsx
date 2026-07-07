"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Project = {
  id: string;
  name: string;
  emoji: string | null;
  instructions: string | null;
  updatedAt: number;
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects));
  }, []);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, emoji, instructions }),
      });
      const d = await res.json();
      if (d.project) {
        setProjects((p) => [d.project, ...(p ?? [])]);
        setName("");
        setEmoji("");
        setInstructions("");
        setCreating(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-ink">Projects</h1>
        {!creating && <Button onClick={() => setCreating(true)}>+ New project</Button>}
      </div>
      <p className="text-sm text-ink-dim mb-6">
        A project is an isolated workspace — its own instructions, its own chats, and its own
        memory. Nothing leaks between projects.
      </p>

      {creating && (
        <Card className="p-5 flex flex-col gap-3 mb-6">
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
              placeholder="Project name"
              autoFocus
            />
          </div>
          <textarea
            className="rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent min-h-24"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Instructions — how the agent should behave in this project (becomes the system prompt for every chat here)."
          />
          <div className="flex gap-2">
            <Button onClick={create} disabled={busy || !name.trim()}>
              Create
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {projects === null ? (
        <p className="text-sm text-ink-dim">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-ink-dim">No projects yet. Create one to get started.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`}>
                <Card className="p-4 hover:border-accent transition-colors cursor-pointer h-full">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{p.emoji || "📁"}</span>
                    <span className="text-sm font-medium text-ink truncate">{p.name}</span>
                  </div>
                  {p.instructions && (
                    <p className="text-xs text-ink-dim mt-2 line-clamp-2">{p.instructions}</p>
                  )}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
