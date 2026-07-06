"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Plus } from "lucide-react";
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

      <ul className="flex flex-col gap-1 overflow-y-auto mt-2">
        {conversations.map((c) => {
          const active = pathname === `/chat/${c.id}`;
          return (
            <li key={c.id}>
              <button
                onClick={() => router.push(`/chat/${c.id}`)}
                className={`w-full text-left rounded-md px-2 py-1.5 text-sm truncate ${
                  active
                    ? "bg-neutral-800 text-white"
                    : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                }`}
                title={c.title}
              >
                {c.title}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
