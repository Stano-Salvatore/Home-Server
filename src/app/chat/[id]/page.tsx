"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import { useChatStream } from "@/lib/useChatStream";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ModelPicker } from "@/components/chat/model-picker";
import { PillToggle } from "@/components/ui/pill-toggle";
import { ArrowUp, Square, RefreshCw } from "lucide-react";
import type { ChatBackend } from "@/lib/types";

type Conversation = {
  id: string;
  title: string;
  backend: string;
  modelId: string;
  projectId: string | null;
  scopeId: string | null;
  ragEnabled: boolean;
  wikiEnabled: boolean;
  webEnabled: boolean;
};
type Project = { id: string; name: string; emoji: string | null };
type Scope = { id: string; label: string; emoji?: string; color: string };

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [input, setInput] = useState("");
  const { messages, streaming, error, send, regenerate, stop, loadHistory } = useChatStream(id);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/chat/conversations/${id}`)
      .then((r) => r.json())
      .then((data) => setConversation(data.conversation));
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []));
    fetch("/api/brain/scopes")
      .then((r) => r.json())
      .then((d) => setScopes(d.scopes ?? []));
    loadHistory(id).then(() => {
      // A first message typed into the /chat landing composer is handed over
      // via sessionStorage — the stream has to run in this page, which owns it.
      const draftKey = `nedory-draft-${id}`;
      const draft = sessionStorage.getItem(draftKey);
      if (draft) {
        sessionStorage.removeItem(draftKey);
        void send(draft);
      }
    });
    // `send` is stable per conversation id (useCallback on conversationId).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loadHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function patch(body: Partial<Conversation>) {
    if (!conversation) return;
    const res = await fetch(`/api/chat/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setConversation(data.conversation);
  }

  function handleSend() {
    const content = input.trim();
    if (!content || streaming) return;
    setInput("");
    void send(content);
  }

  const canRegenerate =
    !streaming && messages.length > 0 && messages[messages.length - 1].role === "assistant";

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 min-w-0">
          {conversation ? (
            <>
              <ModelPicker
                value={{ backend: conversation.backend as ChatBackend, modelId: conversation.modelId }}
                onChange={(v) => patch({ backend: v.backend, modelId: v.modelId })}
              />
              <select
                className="rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1 text-xs text-ink-dim focus:outline-none focus:border-accent"
                value={conversation.projectId ?? ""}
                onChange={(e) => patch({ projectId: e.target.value || null })}
                title="Project"
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.emoji ? `${p.emoji} ` : ""}
                    {p.name}
                  </option>
                ))}
              </select>
              {scopes.length > 0 && (
                <select
                  className="rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1 text-xs text-ink-dim focus:outline-none focus:border-accent"
                  value={conversation.scopeId ?? ""}
                  onChange={(e) =>
                    patch(e.target.value ? { scopeId: e.target.value, ragEnabled: true } : { scopeId: null })
                  }
                  title="Limit Brain retrieval to a scope"
                >
                  <option value="">All Brain</option>
                  {scopes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.emoji ? `${s.emoji} ` : "◆ "}
                      {s.label}
                    </option>
                  ))}
                </select>
              )}
            </>
          ) : (
            <span className="text-sm text-ink-dim">Loading…</span>
          )}
        </div>
        {conversation && (
          <div className="flex items-center gap-1.5 shrink-0">
            <PillToggle active={conversation.ragEnabled} onClick={() => patch({ ragEnabled: !conversation.ragEnabled })}>
              Brain
            </PillToggle>
            <PillToggle active={conversation.wikiEnabled} onClick={() => patch({ wikiEnabled: !conversation.wikiEnabled })}>
              Wikipedia
            </PillToggle>
            <PillToggle active={conversation.webEnabled} onClick={() => patch({ webEnabled: !conversation.webEnabled })}>
              Web
            </PillToggle>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-600">Say something to get started.</p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} modelLabel={conversation?.modelId.split("::").pop()?.replace(/:latest$/, "")} />
        ))}
        {canRegenerate && (
          <button
            onClick={() => void regenerate()}
            className="self-start flex items-center gap-1.5 text-xs text-ink-dim hover:text-ink rounded-md border px-2 py-1"
            style={{ borderColor: "var(--border)" }}
          >
            <RefreshCw size={12} /> Regenerate
          </button>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-5 text-xs text-red-400">{error}</p>}

      <div className="p-4 pt-2">
        <div
          className="rounded-xl border flex items-end gap-2 px-4 py-3"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <textarea
            className="flex-1 resize-none bg-transparent text-sm text-ink placeholder:text-ink-dim focus:outline-none"
            rows={2}
            placeholder="Message Nedory …"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          {streaming ? (
            <button
              onClick={stop}
              aria-label="Stop"
              className="rounded-lg border p-2 text-term-red hover:text-ink transition-colors"
              style={{ borderColor: "var(--border)" }}
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              aria-label="Send"
              className="rounded-lg bg-accent text-black p-2 disabled:opacity-40 hover:bg-accent-hover transition-colors"
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
