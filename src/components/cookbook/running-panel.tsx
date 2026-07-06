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

  if (running.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-neutral-200 mb-2">Running now</h2>
        <p className="text-sm text-neutral-500">Nothing running yet. Pull or start a model above.</p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-neutral-200 mb-3">Running now</h2>
      <ul className="flex flex-col gap-2">
        {running.map((m) => {
          const server = runningServerRows.find((s) => s.id === m.id);
          return (
            <li
              key={`${m.backend}-${m.id}`}
              className="flex items-center justify-between text-sm border border-neutral-800 rounded-md px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Badge color={m.backend === "ollama" ? "blue" : "green"}>{m.backend}</Badge>
                <span className="text-neutral-100">{m.label}</span>
                {m.port && <span className="text-neutral-500 text-xs">:{m.port}</span>}
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
    </Card>
  );
}
