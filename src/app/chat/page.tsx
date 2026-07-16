"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { ModelPicker } from "@/components/chat/model-picker";

const LAST_MODEL_KEY = "nedory-last-model";

export default function ChatIndexPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [model, setModel] = useState<{ backend: string; modelId: string } | null>(null);
  const [brain, setBrain] = useState(false);
  const [wiki, setWiki] = useState(false);
  const [starting, setStarting] = useState(false);

  // Preselect whatever model the last chat was started with. Deferred a tick
  // so the server-rendered markup (no localStorage) hydrates cleanly before
  // the stored value lands — also what keeps set-state-in-effect happy.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem(LAST_MODEL_KEY);
        if (raw) setModel(JSON.parse(raw));
      } catch {
        // corrupt/absent — the picker just starts empty
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  async function start() {
    const content = input.trim();
    if (!content || !model || starting) return;
    setStarting(true);
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backend: model.backend,
          modelId: model.modelId,
          ragEnabled: brain,
          wikiEnabled: wiki,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start chat");
      localStorage.setItem(LAST_MODEL_KEY, JSON.stringify(model));
      sessionStorage.setItem(`nedory-draft-${data.conversation.id}`, content);
      router.push(`/chat/${data.conversation.id}`);
    } catch {
      setStarting(false);
    }
  }

  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center px-4 gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-accent flex items-center gap-2">
          <span aria-hidden>◢</span> Nedory
        </h1>
        <p className="text-sm text-ink-dim">yours, fully local.</p>
        <p className="text-[11px] text-ink-dim opacity-60 max-w-xs">
          Tip: enable Brain to answer from your notes and library.
        </p>
      </div>

      <div
        className="w-full max-w-2xl rounded-xl border shadow-lg"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-start justify-between gap-2 px-4 pt-3">
          <textarea
            className="flex-1 resize-none bg-transparent text-sm text-ink placeholder:text-ink-dim focus:outline-none"
            rows={2}
            placeholder="Message Nedory …"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void start();
              }
            }}
          />
          <ModelPicker
            value={model as { backend: "ollama" | "llamacpp"; modelId: string } | null}
            onChange={(v) => setModel({ backend: v.backend, modelId: v.modelId })}
          />
        </div>
        <div className="flex items-center justify-between px-3 pb-3 pt-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setBrain((b) => !b)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                brain ? "border-accent text-accent" : "text-ink-dim hover:text-ink"
              }`}
              style={{ borderColor: brain ? undefined : "var(--border)" }}
            >
              Brain
            </button>
            <button
              onClick={() => setWiki((w) => !w)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                wiki ? "border-accent text-accent" : "text-ink-dim hover:text-ink"
              }`}
              style={{ borderColor: wiki ? undefined : "var(--border)" }}
            >
              Wikipedia
            </button>
          </div>
          <button
            onClick={() => void start()}
            disabled={!input.trim() || !model || starting}
            aria-label="Send"
            className="rounded-lg bg-accent text-black p-2 disabled:opacity-40 hover:bg-accent-hover transition-colors"
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
