"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ModelOption, LlamaCppServerRow } from "@/lib/types";

export function RunningPanel({
  options,
  llamacppServers,
  onChanged,
}: {
  options: ModelOption[];
  llamacppServers: LlamaCppServerRow[];
  onChanged: () => void;
}) {
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const running = options.filter((o) => !o.idle);
  const runningServerRows = llamacppServers.filter((s) => s.status === "running");

  async function stop(id: string) {
    setStoppingId(id);
    try {
      await fetch("/api/models/llamacpp/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      onChanged();
    } finally {
      setStoppingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-neutral-200 mb-3">Running now</h2>
        {running.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing running yet. Pull a model above, or start a llama.cpp server below.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {running.map((m) => {
              const server = runningServerRows.find((s) => s.id === m.id);
              return (
                <li
                  key={`${m.backend}-${m.id}`}
                  className="flex items-center justify-between text-sm border border-neutral-800 rounded-md px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      color={
                        m.backend === "ollama" ? "blue" : m.backend === "litertlm" ? "yellow" : "green"
                      }
                    >
                      {m.nodeName ?? m.backend}
                    </Badge>
                    <span className="text-ink">{m.label}</span>
                    {m.port && <span className="text-ink-dim text-xs">:{m.port}</span>}
                  </div>
                  {server && (
                    <Button
                      variant="danger"
                      onClick={() => stop(server.id)}
                      disabled={stoppingId === server.id}
                    >
                      {stoppingId === server.id ? "Stopping…" : "Stop"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <StartServerForm onStarted={onChanged} />
    </div>
  );
}

function StartServerForm({ onStarted }: { onStarted: () => void }) {
  const [name, setName] = useState("");
  const [modelPath, setModelPath] = useState("");
  const [extraArgs, setExtraArgs] = useState("-ngl 99 --no-kv-offload -c 8192 -np 1 -t 8 --cache-type-k q8_0 --cache-type-v q8_0");
  const [useTmux, setUseTmux] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!name.trim() || !modelPath.trim()) return;
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
      setName("");
      setModelPath("");
      onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }

  return (
    <Card className="p-5 flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-neutral-200">Start a llama.cpp server</h2>
        <p className="text-xs text-ink-dim mt-1">
          Points at a local GGUF file — the binary path (and any Vulkan/env overrides, e.g. Turnip&apos;s
          VK_ICD_FILENAMES) come from Settings. The default extra args below are the tuned flags from
          getting Gemma 4 E4B running well over Vulkan on Adreno: no KV offload (Turnip&apos;s Vulkan
          backend can&apos;t place the KV cache), a realistic 8K context instead of the 128K/4-slot
          default, all 8 CPU cores, and a quantized KV cache to shrink what stays on CPU. Adjust for
          your model/hardware.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent sm:w-40"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name, e.g. gemma4-e4b"
        />
        <input
          className="flex-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent"
          value={modelPath}
          onChange={(e) => setModelPath(e.target.value)}
          placeholder="~/models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf"
        />
      </div>
      <input
        className="rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent font-mono"
        value={extraArgs}
        onChange={(e) => setExtraArgs(e.target.value)}
        placeholder="Extra CLI args"
      />
      <label className="flex items-center gap-2 text-xs text-ink-dim">
        <input type="checkbox" checked={useTmux} onChange={(e) => setUseTmux(e.target.checked)} />
        Run in tmux (recommended on Termux — survives the terminal app losing focus, unlike a plain
        detached process)
      </label>
      <div className="flex items-center gap-3">
        <Button onClick={start} disabled={starting || !name.trim() || !modelPath.trim()}>
          {starting ? "Starting…" : "Start server"}
        </Button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </Card>
  );
}
