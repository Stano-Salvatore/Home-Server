"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { ModelPicker } from "@/components/chat/model-picker";
import { PillToggle } from "@/components/ui/pill-toggle";
import type { ChatBackend } from "@/lib/types";

const LAST_MODEL_KEY = "nedory-last-model";

// claude.ai-style rotating welcome: a different line every visit, aware of
// the hour. Change NAME once to be greeted differently everywhere.
const NAME = "Salvatore";
const GREETINGS: Record<"morning" | "day" | "evening" | "night", string[]> = {
  morning: [
    `Mornin', ${NAME}.`,
    `Rise and shine, ${NAME}.`,
    "Coffee first, questions after.",
    "Early start, captain?",
    "Fresh day, fresh context window.",
  ],
  day: [
    `Afternoon, ${NAME}.`,
    "What are we building today?",
    `Good to see you, ${NAME}.`,
    "The fleet is listening.",
    "Back at it, I see.",
  ],
  evening: [
    `Evening, ${NAME}.`,
    "Golden hour for good questions.",
    `Winding down, ${NAME}?`,
    "One more idea before dinner?",
    "The library is open late.",
  ],
  night: [
    "Night owl.",
    `Still up, ${NAME}?`,
    "The best ideas keep odd hours.",
    "Quiet house, loud thoughts.",
    `Can't sleep, ${NAME}?`,
  ],
};

function pickGreeting(): string {
  const h = new Date().getHours();
  const bucket =
    h >= 5 && h < 11 ? "morning" : h >= 11 && h < 17 ? "day" : h >= 17 && h < 22 ? "evening" : "night";
  const pool = GREETINGS[bucket];
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function ChatIndexPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [model, setModel] = useState<{ backend: string; modelId: string } | null>(null);
  const [brain, setBrain] = useState(false);
  const [wiki, setWiki] = useState(false);
  const [web, setWeb] = useState(false);
  const [starting, setStarting] = useState(false);
  const [greeting, setGreeting] = useState("");

  // Random + clock-dependent, so it must be picked after hydration — the
  // server-rendered HTML can't know the phone's hour (or the dice roll).
  useEffect(() => {
    const t = setTimeout(() => setGreeting(pickGreeting()), 0);
    return () => clearTimeout(t);
  }, []);

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
          webEnabled: web,
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
        {/* min-height keeps the hero from jumping when the greeting lands */}
        <p className="text-base text-ink min-h-[1.5rem]">{greeting}</p>
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
            value={model as { backend: ChatBackend; modelId: string } | null}
            onChange={(v) => setModel({ backend: v.backend, modelId: v.modelId })}
            autoDefault
          />
        </div>
        <div className="flex items-center justify-between px-3 pb-3 pt-2">
          <div className="flex items-center gap-1">
            <PillToggle active={brain} onClick={() => setBrain((b) => !b)}>
              Brain
            </PillToggle>
            <PillToggle active={wiki} onClick={() => setWiki((w) => !w)}>
              Wikipedia
            </PillToggle>
            <PillToggle active={web} onClick={() => setWeb((w) => !w)}>
              Web
            </PillToggle>
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
