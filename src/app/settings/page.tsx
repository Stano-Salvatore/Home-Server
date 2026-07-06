"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Config = {
  vaultPath: string;
  libraryPath: string;
  uploadsPath: string;
  llamaCppBinPath: string;
  ollamaHost: string;
  embeddingModel: string;
};

type Status = Record<"vaultPath" | "libraryPath" | "uploadsPath", { exists: boolean; writable: boolean }>;

const FIELDS: { key: keyof Config; label: string; hint: string }[] = [
  { key: "vaultPath", label: "Obsidian vault path", hint: "Folder containing your .md notes (optional)" },
  { key: "libraryPath", label: "Library folder", hint: "Folder with your .epub / .pdf files" },
  { key: "uploadsPath", label: "Uploads folder", hint: "Where uploaded files/photos are stored" },
  { key: "llamaCppBinPath", label: "llama.cpp binary path", hint: "e.g. llama-server or /usr/local/bin/llama-server" },
  { key: "ollamaHost", label: "Ollama host", hint: "e.g. http://127.0.0.1:11434" },
  { key: "embeddingModel", label: "Embedding model", hint: "Ollama model used for Brain embeddings" },
];

export default function SettingsPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setConfig(data.config);
        setStatus(data.status);
      });
  }, []);

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      setConfig(data.config);
      setStatus(data.status);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return <div className="p-8 text-neutral-400">Loading settings…</div>;
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-xl font-semibold text-neutral-100 mb-1">Settings</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Paths that don&apos;t exist or aren&apos;t writable will disable the dependent
        feature instead of breaking the app.
      </p>

      <Card className="p-5 flex flex-col gap-5">
        {FIELDS.map(({ key, label, hint }) => {
          const pathKey = key as keyof Status;
          const st = status?.[pathKey];
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-neutral-200">{label}</label>
                {st && (
                  <Badge color={st.exists && st.writable ? "green" : "yellow"}>
                    {st.exists && st.writable ? "OK" : "not found"}
                  </Badge>
                )}
              </div>
              <input
                className="w-full rounded-md bg-neutral-950 border border-neutral-800 px-3 py-1.5 text-sm text-neutral-100 focus:outline-none focus:border-indigo-600"
                value={config[key]}
                onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
                placeholder={hint}
              />
              <p className="text-xs text-neutral-600 mt-1">{hint}</p>
            </div>
          );
        })}

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          {savedAt && <span className="text-xs text-neutral-500">Saved.</span>}
        </div>
      </Card>
    </div>
  );
}
