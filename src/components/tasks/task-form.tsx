"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "@/components/chat/model-picker";

export function TaskForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<{ backend: "ollama" | "llamacpp"; modelId: string } | null>(
    null,
  );
  const [triggerType, setTriggerType] = useState<"manual" | "cron" | "file_watch">("manual");
  const [cronExpression, setCronExpression] = useState("0 * * * *");
  const [watchPath, setWatchPath] = useState("");
  const [watchGlob, setWatchGlob] = useState("*");
  const [saveToVault, setSaveToVault] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !prompt.trim() || !model) {
      setError("Name, prompt, and model are required.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          prompt,
          backend: model.backend,
          modelId: model.modelId,
          triggerType,
          cronExpression: triggerType === "cron" ? cronExpression : null,
          watchPath: triggerType === "file_watch" ? watchPath : null,
          watchGlob: triggerType === "file_watch" ? watchGlob : null,
          saveToVault,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create task");
      setName("");
      setPrompt("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          className="rounded bg-neutral-950 border border-neutral-800 px-3 py-1.5 text-sm"
          placeholder="Task name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <ModelPicker value={model} onChange={(v) => setModel(v)} />
      </div>

      <textarea
        className="rounded bg-neutral-950 border border-neutral-800 px-3 py-1.5 text-sm"
        rows={3}
        placeholder="Prompt to run against the model…"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <div className="flex gap-4 text-sm text-neutral-300">
        {(["manual", "cron", "file_watch"] as const).map((t) => (
          <label key={t} className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={triggerType === t}
              onChange={() => setTriggerType(t)}
            />
            {t === "manual" ? "Manual" : t === "cron" ? "Schedule (cron)" : "File watch"}
          </label>
        ))}
      </div>

      {triggerType === "cron" && (
        <input
          className="rounded bg-neutral-950 border border-neutral-800 px-3 py-1.5 text-sm max-w-xs"
          placeholder="Cron expression, e.g. 0 * * * *"
          value={cronExpression}
          onChange={(e) => setCronExpression(e.target.value)}
        />
      )}

      {triggerType === "file_watch" && (
        <div className="grid grid-cols-2 gap-3">
          <input
            className="rounded bg-neutral-950 border border-neutral-800 px-3 py-1.5 text-sm"
            placeholder="Folder to watch"
            value={watchPath}
            onChange={(e) => setWatchPath(e.target.value)}
          />
          <input
            className="rounded bg-neutral-950 border border-neutral-800 px-3 py-1.5 text-sm"
            placeholder="Filename glob, e.g. *.md"
            value={watchGlob}
            onChange={(e) => setWatchGlob(e.target.value)}
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-neutral-400">
        <input
          type="checkbox"
          checked={saveToVault}
          onChange={(e) => setSaveToVault(e.target.checked)}
        />
        Save each run&apos;s output to Obsidian
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div>
        <Button onClick={submit} disabled={creating}>
          {creating ? "Creating…" : "Create task"}
        </Button>
      </div>
    </div>
  );
}
