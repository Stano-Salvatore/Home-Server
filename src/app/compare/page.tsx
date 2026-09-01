"use client";

import { useCallback, useEffect, useState } from "react";
import { ModelPicker } from "@/components/chat/model-picker";
import { Swords } from "lucide-react";
import type { ChatBackend } from "@/lib/types";

// Blind A/B: same prompt, two models, unlabeled answers. Which answer lands
// on which side is shuffled client-side AFTER the responses arrive, and the
// model names stay hidden until a vote is cast — so verdicts measure the
// writing, not the reputation. The scoreboard accumulates across sessions.

type Target = { backend: ChatBackend; modelId: string };
type Answer = { text: string; ms: number };
type Verdict = { winner: string; loser: string } | { winner: "tie" | "both-bad"; loser: "" };

function shortName(modelId: string): string {
  const sep = modelId.indexOf("::");
  return (sep === -1 ? modelId : modelId.slice(sep + 2)).replace(/:latest$/, "");
}

export default function ComparePage() {
  const [prompt, setPrompt] = useState("");
  const [left, setLeft] = useState<Target | null>(null);
  const [right, setRight] = useState<Target | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // answers as displayed: display[0] = left card. mapping remembers which
  // target produced each side.
  const [display, setDisplay] = useState<{ answer: Answer; target: Target }[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [scoreboard, setScoreboard] = useState<{ modelId: string; wins: number; losses: number }[]>([]);

  const loadBoard = useCallback(async () => {
    const res = await fetch("/api/compare");
    const data = await res.json();
    setScoreboard(data.scoreboard ?? []);
  }, []);
  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  async function run() {
    if (!prompt.trim() || !left || !right || running) return;
    setRunning(true);
    setError(null);
    setDisplay(null);
    setRevealed(false);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, a: left, b: right }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const pair = [
        { answer: data.a as Answer, target: left },
        { answer: data.b as Answer, target: right },
      ];
      if (Math.random() < 0.5) pair.reverse(); // the blind part
      setDisplay(pair);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function vote(v: Verdict) {
    if (!display) return;
    setRevealed(true);
    await fetch("/api/compare", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        winner: v.winner,
        loser: v.loser,
        a: display[0].target.modelId,
        b: display[1].target.modelId,
      }),
    });
    void loadBoard();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 flex items-center gap-2 text-lg font-bold text-ink">
        <Swords size={18} className="text-accent" /> compare
      </h1>
      <p className="mb-6 text-sm text-ink-dim">
        Same prompt, two models, blind. Vote before you peek — the names show after.
      </p>

      <div
        className="mb-4 rounded-xl border p-4"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <textarea
          className="w-full resize-none bg-transparent text-sm text-ink placeholder:text-ink-dim focus:outline-none"
          rows={3}
          placeholder="A prompt worth arguing over…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ModelPicker value={left} onChange={(v) => setLeft({ backend: v.backend, modelId: v.modelId })} />
          <span className="text-xs text-ink-dim">vs</span>
          <ModelPicker value={right} onChange={(v) => setRight({ backend: v.backend, modelId: v.modelId })} />
          <button
            onClick={() => void run()}
            disabled={!prompt.trim() || !left || !right || running}
            className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            {running ? "Running…" : "Fight"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-term-red">{error}</p>}
      </div>

      {display && (
        <>
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            {display.map((side, i) => (
              <div
                key={i}
                className="rounded-xl border p-4"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="font-mono text-xs font-bold text-accent">
                    {revealed ? shortName(side.target.modelId) : i === 0 ? "answer A" : "answer B"}
                  </span>
                  <span className="text-[10px] text-ink-dim">{(side.answer.ms / 1000).toFixed(1)}s</span>
                </div>
                <div className="whitespace-pre-wrap text-sm text-ink">{side.answer.text}</div>
              </div>
            ))}
          </div>
          {!revealed && (
            <div className="mb-6 flex flex-wrap justify-center gap-2">
              <button
                onClick={() => void vote({ winner: display[0].target.modelId, loser: display[1].target.modelId })}
                className="rounded-lg border px-4 py-2 text-sm text-ink hover:text-accent"
                style={{ borderColor: "var(--border)" }}
              >
                A wins
              </button>
              <button
                onClick={() => void vote({ winner: display[1].target.modelId, loser: display[0].target.modelId })}
                className="rounded-lg border px-4 py-2 text-sm text-ink hover:text-accent"
                style={{ borderColor: "var(--border)" }}
              >
                B wins
              </button>
              <button
                onClick={() => void vote({ winner: "tie", loser: "" })}
                className="rounded-lg border px-4 py-2 text-sm text-ink-dim hover:text-ink"
                style={{ borderColor: "var(--border)" }}
              >
                Tie
              </button>
              <button
                onClick={() => void vote({ winner: "both-bad", loser: "" })}
                className="rounded-lg border px-4 py-2 text-sm text-ink-dim hover:text-ink"
                style={{ borderColor: "var(--border)" }}
              >
                Both bad
              </button>
            </div>
          )}
        </>
      )}

      {scoreboard.length > 0 && (
        <div
          className="rounded-xl border p-4"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <h2 className="mb-2 font-mono text-xs font-bold uppercase tracking-wide text-ink-dim">
            scoreboard
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {scoreboard.map((row) => (
                <tr key={row.modelId} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 font-mono text-xs text-ink">{shortName(row.modelId)}</td>
                  <td className="py-1.5 text-right text-term-green">{row.wins}W</td>
                  <td className="py-1.5 pl-3 text-right text-ink-dim">{row.losses}L</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
