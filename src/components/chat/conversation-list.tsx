"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Plus, Search, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "./model-picker";

type Conversation = {
  id: string;
  title: string;
  backend: string;
  modelId: string;
  updatedAt: number;
};

export function ConversationList() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<{ backend: "ollama" | "llamacpp"; modelId: string } | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const router = useRouter();
  const pathname = usePathname();

  function fetchConversations() {
    return fetch("/api/chat/conversations")
      .then((r) => r.json())
      .then((data) => data.conversations ?? []);
  }

  function refresh() {
    fetchConversations().then(setConversations);
  }

  useEffect(() => {
    fetchConversations().then((list) => setConversations(list));
  }, [pathname]);

  async function createConversation() {
    if (!pending) return;
    const res = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backend: pending.backend, modelId: pending.modelId }),
    });
    const data = await res.json();
    setCreating(false);
    setPending(null);
    refresh();
    router.push(`/chat/${data.conversation.id}`);
  }

  async function saveTitle(id: string) {
    const title = editTitle.trim();
    setEditing(null);
    if (!title) return;
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    await fetch(`/api/chat/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }

  async function remove(id: string) {
    if (!confirm("Delete this conversation? This can't be undone.")) return;
    await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (pathname === `/chat/${id}`) router.push("/chat");
  }

  const filtered = query.trim()
    ? conversations.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()))
    : conversations;

  return (
    <div className="w-64 shrink-0 border-r border-neutral-900 h-full flex flex-col p-3 gap-2">
      {!creating ? (
        <Button variant="secondary" onClick={() => setCreating(true)}>
          <Plus size={14} /> New Chat
        </Button>
      ) : (
        <div className="flex flex-col gap-2 border border-neutral-800 rounded-md p-2">
          <ModelPicker value={pending} onChange={(v) => setPending(v)} />
          <div className="flex gap-2">
            <Button onClick={createConversation} disabled={!pending}>
              Start
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="relative mt-1">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-dim" />
        <input
          className="w-full rounded-md bg-[var(--surface-2)] border border-[var(--border)] pl-7 pr-2 py-1.5 text-sm text-ink focus:outline-none focus:border-accent"
          placeholder="Search chats…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <ul className="flex flex-col gap-1 overflow-y-auto mt-1">
        {filtered.length === 0 && (
          <li className="text-xs text-ink-dim px-2 py-2">
            {conversations.length === 0 ? "No chats yet." : "No matches."}
          </li>
        )}
        {filtered.map((c) => {
          const active = pathname === `/chat/${c.id}`;
          if (editing === c.id) {
            return (
              <li key={c.id} className="flex items-center gap-1 px-1">
                <input
                  autoFocus
                  className="flex-1 min-w-0 rounded bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTitle(c.id);
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
                <button onClick={() => saveTitle(c.id)} className="text-ink-dim hover:text-term-green p-1">
                  <Check size={14} />
                </button>
                <button onClick={() => setEditing(null)} className="text-ink-dim hover:text-ink p-1">
                  <X size={14} />
                </button>
              </li>
            );
          }
          return (
            <li key={c.id} className="group flex items-center">
              <button
                onClick={() => router.push(`/chat/${c.id}`)}
                className={`flex-1 min-w-0 text-left rounded-md px-2 py-1.5 text-sm truncate ${
                  active
                    ? "bg-neutral-800 text-white"
                    : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                }`}
                title={c.title}
              >
                {c.title}
              </button>
              <button
                onClick={() => {
                  setEditing(c.id);
                  setEditTitle(c.title);
                }}
                className="opacity-0 group-hover:opacity-100 text-ink-dim hover:text-ink p-1"
                title="Rename"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => remove(c.id)}
                className="opacity-0 group-hover:opacity-100 text-ink-dim hover:text-accent p-1"
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
