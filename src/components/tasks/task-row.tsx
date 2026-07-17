"use client";

import { useEffect, useState } from "react";
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

function relativeTime(epochSeconds: number): string {
  const diffS = Math.max(0, Date.now() / 1000 - epochSeconds);
  if (diffS < 60) return "just now";
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
  return `${Math.floor(diffS / 86400)}d ago`;
}

export function TaskRow({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [running, setRunning] = useState(false);

  async function loadRuns() {
    const res = await fetch(`/api/tasks/${task.id}/runs`);
    const data = await res.json();
    setRuns(data.runs ?? []);
  }

  // Loaded eagerly (not just on expand) so a scheduled task's last-run state
  // is visible at a glance in the collapsed row — the only way to tell
  // whether a cron/file-watch trigger is actually still firing without
  // digging into every task individually.
  useEffect(() => {
    const t = setTimeout(() => void loadRuns(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  async function toggleExpand() {
    if (!expanded) await loadRuns(); // catch any run that fired since mount
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

  const lastRun = runs[0]; // listTaskRuns orders newest-first
  const lastRunLabel = lastRun
    ? `last ${lastRun.status} ${relativeTime(lastRun.startedAt)} (${lastRun.triggerSource})`
    : task.triggerType === "manual"
      ? "never run"
      : "never fired yet";

  return (
    <div className="border border-neutral-800 rounded-md">
      <div className="flex items-center justify-between p-3">
        <button className="text-left flex-1" onClick={toggleExpand}>
          <div className="text-sm text-neutral-100 font-medium">{task.name}</div>
          <div className="text-xs text-neutral-500">
            [{task.backend}] {task.modelId} &middot; {triggerLabel}
          </div>
          <div className="text-xs mt-0.5 flex items-center gap-1">
            {lastRun && (
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{
                  background:
                    lastRun.status === "success"
                      ? "var(--color-term-green)"
                      : lastRun.status === "error"
                        ? "var(--color-term-red)"
                        : "var(--color-term-gold)",
                }}
              />
            )}
            <span className={lastRun ? "text-neutral-500" : "text-neutral-600 italic"}>
              {lastRunLabel}
            </span>
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
