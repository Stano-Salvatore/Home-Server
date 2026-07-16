"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, X, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { ModelPicker } from "@/components/chat/model-picker";
import { Markdown } from "@/components/chat/markdown";
import { ThinkingSpiral } from "@/components/ui/thinking-spiral";
import type { ChatBackend } from "@/lib/types";

type Run = {
  id: string;
  prompt: string;
  mode: string;
  backend: string;
  modelId: string;
  rounds: number;
  status: "running" | "done" | "error" | "cancelled";
  statusText: string | null;
  round: number;
  sourcesCount: number;
  report: string | null;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
};

const MODES = [
  { id: "auto", label: "Auto" },
  { id: "product", label: "Product" },
  { id: "compare", label: "Compare" },
  { id: "howto", label: "How-to" },
  { id: "factcheck", label: "Fact-check" },
];

function elapsed(run: Run): string {
  const end = run.finishedAt ?? Date.now() / 1000;
  const s = Math.max(0, Math.round(end - run.createdAt));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function RunCard({ run, onChanged }: { run: Run; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const running = run.status === "running";

  async function cancel() {
    await fetch(`/api/research/${run.id}`, { method: "PATCH" });
    onChanged();
  }
  async function remove() {
    if (!confirm("Delete this research run?")) return;
    await fetch(`/api/research/${run.id}`, { method: "DELETE" });
    onChanged();
  }
  async function saveToObsidian() {
    if (!run.report) return;
    const res = await fetch("/api/obsidian/save-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: `research-${run.id.slice(-6)}`,
        content: `# Research: ${run.prompt}\n\n${run.report}`,
        source: "research",
      }),
    });
    if (res.ok) setSaved(true);
  }

  return (
    <div
      className="rounded-lg border"
      style={{ background: "var(--surface)", borderColor: running ? "var(--color-accent-dim)" : "var(--border)" }}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex-1 min-w-0 text-left flex items-center gap-2"
        >
          <span className="truncate text-sm text-ink">{run.prompt}</span>
          <span className="text-[11px] text-ink-dim shrink-0">{run.modelId}</span>
          <span className="text-[11px] text-ink-dim opacity-60 shrink-0">{elapsed(run)}</span>
        </button>
        {run.status === "done" && (
          <span className="text-[11px]" style={{ color: "var(--color-term-green)" }}>done</span>
        )}
        {run.status === "error" && <span className="text-[11px] text-term-red">error</span>}
        {run.status === "cancelled" && <span className="text-[11px] text-ink-dim">cancelled</span>}
        {running ? (
          <button onClick={cancel} aria-label="Cancel" className="p-1 text-ink-dim hover:text-term-red">
            <X size={14} />
          </button>
        ) : (
          <button onClick={remove} aria-label="Delete" className="p-1 text-ink-dim hover:text-term-red">
            <Trash2 size={14} />
          </button>
        )}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Collapse" : "Expand"}
          className="p-1 text-ink-dim hover:text-ink"
        >
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {running && (
        <div
          className="mx-4 mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs text-accent"
          style={{ background: "rgba(224, 108, 117, 0.08)" }}
        >
          <ThinkingSpiral />
          <span className="truncate">{run.statusText ?? "working"}</span>
          <span className="ml-auto shrink-0 text-ink-dim">
            round {run.round} · {run.sourcesCount} sources
          </span>
        </div>
      )}

      {run.status === "error" && run.error && (
        <p className="px-4 pb-3 text-xs text-term-red">{run.error}</p>
      )}

      {open && run.report && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <div className="md text-sm">
            <Markdown content={run.report} />
          </div>
          <div className="mt-3 pt-2 border-t flex items-center gap-3" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={saveToObsidian}
              disabled={saved}
              className="text-xs text-ink-dim hover:text-ink disabled:opacity-50"
            >
              {saved ? "Saved to Obsidian" : "Save to Obsidian"}
            </button>
            <span className="text-[11px] text-ink-dim ml-auto">
              {run.sourcesCount} sources · {run.rounds} rounds
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResearchPage() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("auto");
  const [rounds, setRounds] = useState(2);
  const [model, setModel] = useState<{ backend: string; modelId: string } | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/research");
    const data = await res.json();
    setRuns(data.runs ?? []);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  // Poll while anything is running so status lines and reports appear live.
  const anyRunning = runs.some((r) => r.status === "running");
  useEffect(() => {
    if (anyRunning && !pollRef.current) {
      pollRef.current = setInterval(() => void refresh(), 2500);
    }
    if (!anyRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [anyRunning, refresh]);

  async function start() {
    const p = prompt.trim();
    if (!p || !model || starting) return;
    setStarting(true);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, mode, rounds, backend: model.backend, modelId: model.modelId }),
      });
      if (res.ok) {
        setPrompt("");
        await refresh();
      }
    } finally {
      setStarting(false);
    }
  }

  const active = runs.filter((r) => r.status === "running");
  const past = runs.filter((r) => r.status !== "running");

  return (
    <div className="max-w-3xl mx-auto p-5 flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold text-accent flex items-center gap-2">Deep Research</h1>
        <p className="text-xs text-ink-dim mt-1">
          Multi-round research over web search, Wikipedia and your Brain — gathered, read and
          synthesized into a report. Fully offline it still works from Brain + Kiwix.
        </p>
      </div>

      <div className="rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="px-4 pt-3">
          <textarea
            className="w-full resize-none bg-transparent text-sm text-ink placeholder:text-ink-dim focus:outline-none"
            rows={3}
            placeholder="e.g. Compare Egon Bondy's and Ladislav Klíma's philosophical positions using my notes and the web"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                mode === m.id ? "border-accent text-accent" : "text-ink-dim hover:text-ink"
              }`}
              style={{
                borderColor: mode === m.id ? undefined : "var(--border)",
                background: mode === m.id ? "rgba(224, 108, 117, 0.10)" : undefined,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div
          className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-2 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <ModelPicker
            value={model as { backend: ChatBackend; modelId: string } | null}
            onChange={(v) => setModel({ backend: v.backend, modelId: v.modelId })}
          />
          <label className="flex items-center gap-1.5 text-xs text-ink-dim">
            rounds
            <select
              className="rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent"
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <button
            onClick={() => void start()}
            disabled={!prompt.trim() || !model || starting}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent text-black px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-accent-hover transition-colors"
          >
            <Play size={12} /> Start
          </button>
        </div>
      </div>

      {active.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold" style={{ color: "var(--color-steel)" }}>
            Active <span className="text-ink-dim font-normal">{active.length} research</span>
          </h2>
          {active.map((r) => (
            <RunCard key={r.id} run={r} onChanged={() => void refresh()} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold" style={{ color: "var(--color-steel)" }}>
          Past research
        </h2>
        {past.length === 0 && <p className="text-xs text-ink-dim">Nothing yet.</p>}
        {past.map((r) => (
          <RunCard key={r.id} run={r} onChanged={() => void refresh()} />
        ))}
      </div>
    </div>
  );
}
