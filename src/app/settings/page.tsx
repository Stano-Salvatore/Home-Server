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
  embeddingHost: string;
  qdrantUrl: string;
  wikipediaProvider: string;
  kiwixUrl: string;
  wikipediaLangs: string;
};

type Status = Record<"vaultPath" | "libraryPath" | "uploadsPath", { exists: boolean; writable: boolean }>;

const FIELDS: { key: keyof Config; label: string; hint: string }[] = [
  { key: "libraryPath", label: "Library folder", hint: "Folder with your .epub / .pdf files" },
  { key: "uploadsPath", label: "Uploads folder", hint: "Where uploaded files/photos are stored" },
  { key: "llamaCppBinPath", label: "llama.cpp binary path", hint: "e.g. llama-server or /usr/local/bin/llama-server" },
  { key: "ollamaHost", label: "Ollama host", hint: "e.g. http://127.0.0.1:11434" },
  { key: "embeddingModel", label: "Embedding model", hint: "Ollama model used for Brain embeddings (e.g. bge-m3, nomic-embed-text)" },
  { key: "embeddingHost", label: "Embedding host (optional)", hint: "Ollama for embeddings; blank = same as chat node. Set to this phone's own Ollama (e.g. http://127.0.0.1:11434) to keep it off the compute node." },
  { key: "qdrantUrl", label: "Qdrant URL (optional)", hint: "Blank = keep vectors in this phone's RAM. Set to a Qdrant server (e.g. http://<lenovo-ip>:6333) to hold memory off-device so it can scale to gigabytes." },
  { key: "kiwixUrl", label: "Kiwix URL(s) (offline Wikipedia)", hint: "kiwix-serve host(s). Comma-separate several to try in order — e.g. a small local ZIM first, a big one on another box as fallback." },
  { key: "wikipediaLangs", label: "Wikipedia languages", hint: "Comma-separated wiki codes, e.g. en,cs" },
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
      <h1 className="text-xl font-semibold text-ink mb-1">Settings</h1>
      <p className="text-sm text-ink-dim mb-6">
        Paths that don&apos;t exist or aren&apos;t writable will disable the dependent
        feature instead of breaking the app.
      </p>

      <VaultsCard />

      <Card className="p-5 flex flex-col gap-5">
        <div>
          <label className="text-sm font-medium text-ink mb-1 block">Wikipedia grounding</label>
          <select
            className="w-full rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent"
            value={config.wikipediaProvider}
            onChange={(e) => setConfig({ ...config, wikipediaProvider: e.target.value })}
          >
            <option value="online">Online — live Wikipedia API (needs internet)</option>
            <option value="kiwix">Offline — Kiwix on your network</option>
          </select>
          <p className="text-xs text-ink-dim mt-1">
            Offline uses the Kiwix URL below; online falls back automatically if a chat has Wikipedia
            on and no Kiwix hit.
          </p>
        </div>

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
                className="w-full rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent"
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

type Vault = { id: string; name: string; path: string; status: { exists: boolean; writable: boolean } };

function VaultsCard() {
  const [vaults, setVaults] = useState<Vault[] | null>(null);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [rescan, setRescan] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/vaults")
      .then((r) => r.json())
      .then((d) => setVaults(d.vaults));
  }, []);

  async function add() {
    if (!path.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, path }),
      });
      const d = await res.json();
      if (d.vaults) {
        setVaults(d.vaults);
        setName("");
        setPath("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/vaults?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const d = await res.json();
      if (d.vaults) setVaults(d.vaults);
    } finally {
      setBusy(false);
    }
  }

  async function rescanAll() {
    setBusy(true);
    setRescan("Rescanning…");
    try {
      const res = await fetch("/api/obsidian/rescan", { method: "POST" });
      const d = await res.json();
      if (d.error) {
        setRescan(d.error);
      } else {
        const parts: string[] = [`Indexed ${d.indexed} of ${d.total} notes.`];
        for (const v of d.vaults ?? []) {
          if (v.errors?.length) parts.push(`${v.name}: ${v.errors[0]}`);
        }
        setRescan(parts.join(" "));
      }
    } catch (err) {
      setRescan(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 flex flex-col gap-4 mb-6">
      <div>
        <h2 className="text-sm font-semibold text-ink">Obsidian vaults</h2>
        <p className="text-xs text-ink-dim mt-1">
          Add one or more vault folders — each is watched live and re-indexed into Brain. On
          Android, shared storage often doesn&apos;t emit change events, so hit Rescan after editing
          in Obsidian.
        </p>
      </div>

      {vaults === null ? (
        <p className="text-sm text-ink-dim">Loading…</p>
      ) : vaults.length === 0 ? (
        <p className="text-sm text-ink-dim">No vaults yet. Add one below.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {vaults.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-3 rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink truncate">{v.name}</span>
                  <Badge color={v.status.exists ? "green" : "yellow"}>
                    {v.status.exists ? "found" : "not found"}
                  </Badge>
                </div>
                <div className="text-xs text-ink-dim truncate">{v.path}</div>
              </div>
              <Button variant="secondary" onClick={() => remove(v.id)} disabled={busy}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent sm:w-40"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
        />
        <input
          className="flex-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/storage/emulated/0/Obsidian/MyVault"
        />
        <Button onClick={add} disabled={busy || !path.trim()}>
          Add
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={rescanAll} disabled={busy || (vaults?.length ?? 0) === 0}>
          Rescan all
        </Button>
        {rescan && <span className="text-xs text-ink-dim">{rescan}</span>}
      </div>
    </Card>
  );
}
