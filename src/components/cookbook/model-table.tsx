"use client";

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { readSSE } from "@/lib/sse";
import type { ScoredModel, FitLabel } from "@/lib/types";

const LABEL_COLOR: Record<FitLabel, "green" | "blue" | "yellow" | "red"> = {
  PERFECT: "green",
  GOOD: "blue",
  TIGHT: "yellow",
  "WON'T FIT": "red",
};

export function ModelTable({
  models,
  installedTags,
  onPulled,
}: {
  models: ScoredModel[];
  installedTags: Set<string>;
  onPulled: () => void;
}) {
  const [pullingTag, setPullingTag] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [startFormFor, setStartFormFor] = useState<string | null>(null);

  async function pull(tag: string) {
    setPullingTag(tag);
    setProgress("starting…");
    try {
      const res = await fetch("/api/models/ollama/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag }),
      });
      for await (const data of readSSE(res) as AsyncGenerator<{
        error?: string;
        status?: string;
        completed?: number;
        total?: number;
      }>) {
        if (data.error) {
          setProgress(`error: ${data.error}`);
        } else if (data.total && data.completed) {
          const pct = Math.round((data.completed / data.total) * 100);
          setProgress(`${data.status} — ${pct}%`);
        } else {
          setProgress(data.status ?? "");
        }
      }
      onPulled();
    } finally {
      setPullingTag(null);
      setProgress("");
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-800">
            <th className="py-2 pr-3">Fit</th>
            <th className="py-2 pr-3">Model</th>
            <th className="py-2 pr-3">Params</th>
            <th className="py-2 pr-3">Quant</th>
            <th className="py-2 pr-3">Ctx</th>
            <th className="py-2 pr-3">Speed</th>
            <th className="py-2 pr-3">Score</th>
            <th className="py-2 pr-3">Mode</th>
            <th className="py-2 pr-3"></th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => {
            const installed = installedTags.has(m.ollamaTag);
            const isPulling = pullingTag === m.ollamaTag;
            return (
              <Fragment key={m.id}>
                <tr className="border-b border-neutral-900">
                  <td className="py-2 pr-3">
                    <Badge color={LABEL_COLOR[m.label]}>{m.label}</Badge>
                  </td>
                  <td className="py-2 pr-3 text-neutral-100">{m.family}</td>
                  <td className="py-2 pr-3 text-neutral-400">{m.paramsB}B</td>
                  <td className="py-2 pr-3 text-neutral-400">{m.quant}</td>
                  <td className="py-2 pr-3 text-neutral-400">{m.contextLength.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-neutral-400">~{m.estTokPerSec} t/s</td>
                  <td className="py-2 pr-3 text-neutral-300 font-medium">{m.score}</td>
                  <td className="py-2 pr-3 text-neutral-500">{m.mode.toUpperCase()}</td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-2">
                      {installed ? (
                        <Badge color="green">installed</Badge>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() => pull(m.ollamaTag)}
                          disabled={isPulling}
                        >
                          {isPulling ? progress || "Pulling…" : "Pull"}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => setStartFormFor(startFormFor === m.id ? null : m.id)}
                      >
                        llama.cpp
                      </Button>
                    </div>
                  </td>
                </tr>
                {startFormFor === m.id && (
                  <tr className="bg-neutral-900/40">
                    <td colSpan={9} className="p-3">
                      <LlamaCppStartForm
                        suggestedName={`${m.family} ${m.paramsB}B`}
                        onStarted={() => {
                          setStartFormFor(null);
                          onPulled();
                        }}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LlamaCppStartForm({
  suggestedName,
  onStarted,
}: {
  suggestedName: string;
  onStarted: () => void;
}) {
  const [name, setName] = useState(suggestedName);
  const [modelPath, setModelPath] = useState("");
  const [extraArgs, setExtraArgs] = useState("");
  const [useTmux, setUseTmux] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/models/llamacpp/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, modelPath, extraArgs, useTmux }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start server");
      onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 max-w-xl">
      <div className="grid grid-cols-2 gap-2">
        <input
          className="rounded bg-neutral-950 border border-neutral-800 px-2 py-1 text-sm"
          placeholder="Server name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="rounded bg-neutral-950 border border-neutral-800 px-2 py-1 text-sm"
          placeholder="/path/to/model.gguf"
          value={modelPath}
          onChange={(e) => setModelPath(e.target.value)}
        />
      </div>
      <input
        className="rounded bg-neutral-950 border border-neutral-800 px-2 py-1 text-sm"
        placeholder="Extra llama-server args (optional)"
        value={extraArgs}
        onChange={(e) => setExtraArgs(e.target.value)}
      />
      <label className="flex items-center gap-2 text-xs text-neutral-400">
        <input type="checkbox" checked={useTmux} onChange={(e) => setUseTmux(e.target.checked)} />
        Run inside a tmux session
      </label>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div>
        <Button onClick={start} disabled={starting || !modelPath}>
          {starting ? "Starting…" : "Start server"}
        </Button>
      </div>
    </div>
  );
}
