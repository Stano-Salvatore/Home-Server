"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WakeWordTester } from "@/components/settings/wake-word-tester";
import { PowerCard } from "@/components/settings/power-card";

type Config = {
  vaultPath: string;
  libraryPath: string;
  uploadsPath: string;
  llamaCppBinPath: string;
  llamaCppEnv: string;
  ollamaHost: string;
  litertlmBaseUrl: string;
  litertlmModelId: string;
  embeddingModel: string;
  embeddingHost: string;
  qdrantUrl: string;
  wikipediaProvider: string;
  kiwixUrl: string;
  wikipediaLangs: string;
  kiwixExtraBooks: string;
  wakeWords: string;
  webSearchProvider: string;
  searxngUrl: string;
  braveApiKey: string;
  homeAssistantUrl: string;
  homeAssistantToken: string;
  dbBackupDir: string;
};

type Status = Record<"vaultPath" | "libraryPath" | "uploadsPath", { exists: boolean; writable: boolean }>;
type SecretKey = "braveApiKey" | "homeAssistantToken";
type SecretsSet = Record<SecretKey, boolean>;

const SECRET_KEYS = new Set<string>(["braveApiKey", "homeAssistantToken"]);

const FIELDS: { key: keyof Config; label: string; hint: string }[] = [
  { key: "libraryPath", label: "Library folder", hint: "Folder with your .epub / .pdf files" },
  { key: "uploadsPath", label: "Uploads folder", hint: "Where uploaded files/photos are stored" },
  { key: "llamaCppBinPath", label: "llama.cpp binary path", hint: "e.g. llama-server or /usr/local/bin/llama-server" },
  { key: "llamaCppEnv", label: "llama.cpp environment overrides (optional)", hint: "Space-separated KEY=value pairs passed to every launch, e.g. VK_ICD_FILENAMES=/data/data/com.termux/files/usr/share/vulkan/icd.d/freedreno_icd.aarch64.json — needed for Vulkan/Turnip GPU builds on Android, whose default driver silently ignores this and falls back to CPU/a crashing proprietary driver." },
  { key: "ollamaHost", label: "Ollama host", hint: "e.g. http://127.0.0.1:11434" },
  { key: "litertlmBaseUrl", label: "litert-lm serve URL", hint: "Started manually in tmux — see the litertlm backend. Keep it 127.0.0.1 unless you know you want it reachable from other devices." },
  { key: "litertlmModelId", label: "litert-lm default model id", hint: "The friendly name from `litert-lm import ... <model-id>`. Used when a chat's target model id isn't otherwise known." },
  { key: "embeddingModel", label: "Embedding model", hint: "Ollama model used for Brain embeddings (e.g. bge-m3, nomic-embed-text)" },
  { key: "embeddingHost", label: "Embedding host (optional)", hint: "Ollama for embeddings; blank = same as chat node. Set to this phone's own Ollama (e.g. http://127.0.0.1:11434) to keep it off the compute node." },
  { key: "qdrantUrl", label: "Qdrant URL (optional)", hint: "Blank = keep vectors in this phone's RAM. Set to a Qdrant server (e.g. http://<lenovo-ip>:6333) to hold memory off-device so it can scale to gigabytes." },
  { key: "kiwixUrl", label: "Kiwix URL(s) (offline Wikipedia)", hint: "kiwix-serve host(s). Comma-separate several to try in order — e.g. a small local ZIM first, a big one on another box as fallback." },
  { key: "wikipediaLangs", label: "Wikipedia languages", hint: "Comma-separated wiki codes, e.g. en,cs" },
  { key: "kiwixExtraBooks", label: "Extra Kiwix books", hint: "Non-encyclopedia ZIMs consulted alongside the wikis, by book name — e.g. wiktionary_en_all for a dictionary that defines Latin and French terms." },
  { key: "wakeWords", label: "Wake words", hint: "Comma-separated. Whisper mishears a name in its own consistent ways — use the tester below to see what it actually heard, and add those spellings." },
  { key: "searxngUrl", label: "SearXNG URL (optional)", hint: "Self-hosted SearXNG instance for the web search provider, e.g. http://<lenovo-ip>:8888" },
  { key: "braveApiKey", label: "Brave Search API key (optional)", hint: "Only needed when the web search provider is Brave" },
  { key: "homeAssistantUrl", label: "Home Assistant URL (optional)", hint: "e.g. http://<lenovo-ip>:8123 — enables the home_assistant_* tools for any agent (and voice) with tool calling on" },
  { key: "homeAssistantToken", label: "Home Assistant long-lived access token (optional)", hint: "Home Assistant → your profile → Security → Long-Lived Access Tokens" },
  { key: "dbBackupDir", label: "DB backup folder (optional)", hint: "Blank = data/backups next to the database. Point at a mounted network share to get nightly backups off-device." },
];

export default function SettingsPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [secretsSet, setSecretsSet] = useState<SecretsSet | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [reindexMsg, setReindexMsg] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setConfig(data.config);
        setStatus(data.status);
        setSecretsSet(data.secretsSet);
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
      // The server never echoes a real secret back (GET/PUT both mask it to
      // ""), so this naturally clears any secret field just typed into —
      // same as SecurityCard clearing its password field after save. The
      // "set" badge below is what confirms it actually saved.
      setConfig(data.config);
      setStatus(data.status);
      setSecretsSet(data.secretsSet);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  async function reindexBrain() {
    setReindexing(true);
    setReindexMsg("Reindexing… re-embedding every note with the current model. This can take a while.");
    try {
      const res = await fetch("/api/brain/reindex", { method: "POST" });
      const d = await res.json();
      if (d.error) {
        setReindexMsg(d.error);
      } else {
        setReindexMsg(`Reindexed ${d.chunks} chunks across ${d.documents} documents.`);
      }
    } catch (err) {
      setReindexMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setReindexing(false);
    }
  }

  async function backupNow() {
    setBackingUp(true);
    setBackupMsg(null);
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      const d = await res.json();
      setBackupMsg(d.error ?? `Backed up to ${d.path}`);
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBackingUp(false);
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
      <SecurityCard />
      <PowerCard />

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

        <div>
          <label className="text-sm font-medium text-ink mb-1 block">Web search provider</label>
          <select
            className="w-full rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent"
            value={config.webSearchProvider}
            onChange={(e) => setConfig({ ...config, webSearchProvider: e.target.value })}
          >
            <option value="duckduckgo">DuckDuckGo — free, no key</option>
            <option value="searxng">SearXNG — self-hosted (set URL below)</option>
            <option value="brave">Brave Search — needs API key</option>
            <option value="disabled">Disabled</option>
          </select>
          <p className="text-xs text-ink-dim mt-1">
            Used by the Web toggle in chat and by Deep Research. Needs internet (SearXNG needs your
            instance reachable).
          </p>
        </div>

        {FIELDS.map(({ key, label, hint }) => {
          const pathKey = key as keyof Status;
          const st = status?.[pathKey];
          const isSecret = SECRET_KEYS.has(key);
          const isSet = isSecret && secretsSet?.[key as SecretKey];
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-neutral-200">{label}</label>
                {st && (
                  <Badge color={st.exists && st.writable ? "green" : "yellow"}>
                    {st.exists && st.writable ? "OK" : "not found"}
                  </Badge>
                )}
                {isSecret && <Badge color={isSet ? "green" : "yellow"}>{isSet ? "set" : "not set"}</Badge>}
              </div>
              <input
                type={isSecret ? "password" : "text"}
                className="w-full rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent"
                value={config[key]}
                onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
                placeholder={isSecret ? (isSet ? "Already set — leave blank to keep it" : hint) : hint}
                autoComplete={isSecret ? "off" : undefined}
              />
              <p className="text-xs text-neutral-600 mt-1">{hint}</p>
              {key === "wakeWords" && (
                <WakeWordTester
                  words={config.wakeWords}
                  onAddWord={(w) => {
                    const have = config.wakeWords
                      .split(",")
                      .map((s) => s.trim().toLowerCase())
                      .filter(Boolean);
                    if (have.includes(w)) return;
                    setConfig({ ...config, wakeWords: [...have, w].join(",") });
                  }}
                />
              )}
              {key === "embeddingModel" && (
                <div className="flex items-center gap-3 mt-2">
                  <Button variant="secondary" onClick={reindexBrain} disabled={reindexing}>
                    {reindexing ? "Reindexing…" : "Reindex Brain (re-embed everything)"}
                  </Button>
                </div>
              )}
              {key === "embeddingModel" && reindexMsg && (
                <p className="text-xs text-ink-dim mt-1">{reindexMsg}</p>
              )}
              {key === "dbBackupDir" && (
                <div className="flex items-center gap-3 mt-2">
                  <Button variant="secondary" onClick={backupNow} disabled={backingUp}>
                    {backingUp ? "Backing up…" : "Back up now"}
                  </Button>
                  <span className="text-xs text-ink-dim">Also runs automatically every night at 3am.</span>
                </div>
              )}
              {key === "dbBackupDir" && backupMsg && (
                <p className="text-xs text-ink-dim mt-1">{backupMsg}</p>
              )}
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

// Deliberately its own component with its own fetch/save, hitting
// /api/auth/password rather than the generic /api/settings PUT — the
// dashboard password is a distinct, security-sensitive setting (it must
// never round-trip back in a GET response the way ordinary config fields
// do), not part of AppConfig.
function SecurityCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => setEnabled(!!d.enabled));
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Failed to save");
        return;
      }
      setEnabled(data.enabled);
      setPassword("");
      setMessage(data.enabled ? "Password set — future visits will require it." : "Password protection turned off.");
    } finally {
      setSaving(false);
    }
  }

  if (enabled === null) return null;

  return (
    <Card className="p-5 flex flex-col gap-2 mb-6">
      <label className="text-sm font-medium text-ink mb-1 block">Dashboard password</label>
      <p className="text-xs text-ink-dim">
        {enabled
          ? "A password is currently set — every device on your network needs it to reach this dashboard."
          : "No password set. Anyone who can reach this device on your network (Tailscale, LAN, etc.) can use the dashboard and read your notes/chats. Set one to lock it down."}
      </p>
      <input
        type="password"
        className="rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent"
        placeholder={enabled ? "New password (leave blank to keep current)" : "Set a password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="flex items-center gap-2 mt-1">
        <Button onClick={save} disabled={saving || (!password && !enabled)}>
          {saving ? "saving…" : enabled ? "update password" : "enable password"}
        </Button>
        {enabled && (
          <Button
            variant="ghost"
            onClick={async () => {
              setSaving(true);
              setMessage(null);
              try {
                const res = await fetch("/api/auth/password", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ password: "" }),
                });
                const data = await res.json();
                setEnabled(data.enabled);
                setMessage("Password protection turned off.");
              } finally {
                setSaving(false);
              }
            }}
          >
            turn off
          </Button>
        )}
        {message && <span className="text-xs text-ink-dim">{message}</span>}
      </div>
    </Card>
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
