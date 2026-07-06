"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Task = {
  id: string;
  name: string;
  prompt: string;
  backend: string;
  modelId: string;
  triggerType: string;
  cronExpression: string | null;
  watchPath: string | null;
  watchGlob: string | null;
  enabled: boolean;
};

type TaskRun = {
  id: string;
  status: string;
  triggerSource: string;
  startedAt: number;
  finishedAt: number | null;
  output: string | null;
  error: string | null;
};

export function TaskRow({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [running, setRunning] = useState(false);

  async function loadRuns() {
    const res = await fetch(`/api/tasks/${task.id}/runs`);
    const data = await res.json();
    setRuns(data.runs ?? []);
  }

  async function toggleExpand() {
    if (!expanded) await loadRuns();
    setExpanded(!expanded);
  }

  async function toggleEnabled() {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !task.enabled }),
    });
    onChanged();
  }

  async function runNow() {
    setRunning(true);
    try {
      await fetch(`/api/tasks/${task.id}/run`, { method: "POST" });
      await loadRuns();
      setExpanded(true);
    } finally {
      setRunning(false);
    }
  }

  async function remove() {
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    onChanged();
  }

  const triggerLabel =
    task.triggerType === "cron"
      ? `cron: ${task.cronExpression}`
      : task.triggerType === "file_watch"
        ? `watch: ${task.watchPath}/${task.watchGlob}`
        : "manual";

  return (
    <div className="border border-neutral-800 rounded-md">
      <div className="flex items-center justify-between p-3">
        <button className="text-left flex-1" onClick={toggleExpand}>
          <div className="text-sm text-neutral-100 font-medium">{task.name}</div>
          <div className="text-xs text-neutral-500">
            [{task.backend}] {task.modelId} &middot; {triggerLabel}
          </div>
        </button>
        <div className="flex items-center gap-2">
          <Badge color={task.enabled ? "green" : "neutral"}>
            {task.enabled ? "enabled" : "disabled"}
          </Badge>
          <Button variant="secondary" onClick={runNow} disabled={running}>
            {running ? "Running…" : "Run now"}
          </Button>
          <Button variant="ghost" onClick={toggleEnabled}>
            {task.enabled ? "Disable" : "Enable"}
          </Button>
          <Button variant="danger" onClick={remove}>
            Delete
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-neutral-800 p-3 flex flex-col gap-2">
          <p className="text-xs text-neutral-500 whitespace-pre-wrap">{task.prompt}</p>
          {runs.length === 0 ? (
            <p className="text-xs text-neutral-600">No runs yet.</p>
          ) : (
            runs.map((run) => (
              <div key={run.id} className="text-xs bg-neutral-950 rounded p-2">
                <div className="flex items-center gap-2 mb-1">
                  <Badge color={run.status === "success" ? "green" : run.status === "error" ? "red" : "yellow"}>
                    {run.status}
                  </Badge>
                  <span className="text-neutral-500">{run.triggerSource}</span>
                  <span className="text-neutral-600">
                    {new Date(run.startedAt * 1000).toLocaleString()}
                  </span>
                </div>
                {run.output && <p className="text-neutral-400 whitespace-pre-wrap">{run.output}</p>}
                {run.error && <p className="text-red-400">{run.error}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
