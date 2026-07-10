"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Pencil } from "lucide-react";
import type { ModelOption } from "@/lib/types";
import { resolveAgentOption, agentModelOnline } from "@/lib/agentModel";

type Agent = {
  id: string;
  name: string;
  emoji: string;
  modelTag: string;
  systemPrompt?: string;
  description?: string;
  wikiDefault?: boolean;
  scopeId?: string | null;
};
type Scope = { id: string; label: string; emoji?: string };

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [options, setOptions] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Agent | "new" | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const router = useRouter();

  const fetchAll = useCallback(
    () =>
      Promise.all([
        fetch("/api/agents").then((r) => r.json()),
        fetch("/api/models").then((r) => r.json()),
      ]),
    [],
  );

  const apply = useCallback(([agentsData, modelsData]: [{ agents?: Agent[] }, { options?: ModelOption[] }]) => {
    setAgents(agentsData.agents ?? []);
    setOptions(modelsData.options ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll().then(apply);
  }, [fetchAll, apply]);

  function refresh() {
    fetchAll().then(apply);
  }

  async function launch(agent: Agent) {
    setLaunchError(null);
    const opt = resolveAgentOption(agent.modelTag, options);
    if (!opt) {
      setLaunchError(
        `${agent.name}'s model (${agent.modelTag}) isn't on any online node right now. Check the Nodes tab.`,
      );
      return;
    }
    const res = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        backend: "ollama",
        modelId: opt.id,
        title: `${agent.emoji} ${agent.name}`,
        systemPrompt: agent.systemPrompt || undefined,
        wikiEnabled: agent.wikiDefault ?? false,
        scopeId: agent.scopeId ?? undefined,
      }),
    });
    const data = await res.json();
    router.push(`/chat/${data.conversation.id}`);
  }

  async function remove(id: string) {
    await fetch("/api/agents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    refresh();
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <span className="text-accent">◢</span> agents
        </h1>
        <Button variant="secondary" onClick={() => setEditing("new")}>
          <Plus size={14} /> new agent
        </Button>
      </div>
      <p className="text-sm text-ink-dim mb-6">
        Your named local AIs. Tap one to start chatting with it.
      </p>

      {launchError && <p className="text-sm text-[var(--color-term-red)] mb-4">{launchError}</p>}

      {editing && (
        <AgentForm
          agent={editing === "new" ? null : editing}
          options={options}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {loading ? (
        <p className="text-sm text-ink-dim">loading agents…</p>
      ) : agents.length === 0 ? (
        <p className="text-sm text-ink-dim">
          No agents yet. Click <span className="text-accent">new agent</span> to add one, or pull a
          model on a node first.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {agents.map((agent) => {
            const online = agentModelOnline(agent.modelTag, options);
            return (
              <Card key={agent.id} className="p-4 group relative">
                <button className="w-full text-left" onClick={() => launch(agent)}>
                  <div className="text-4xl mb-2">{agent.emoji}</div>
                  <div className="text-ink font-semibold flex items-center gap-2">
                    {agent.name}
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        online ? "bg-[var(--color-term-green)]" : "bg-[var(--border)]"
                      }`}
                      title={online ? "model available" : "model offline"}
                    />
                  </div>
                  {agent.description && (
                    <div className="text-xs text-ink-dim mt-0.5">{agent.description}</div>
                  )}
                  <div className="text-xs text-ink-dim mt-2 truncate">{agent.modelTag}</div>
                </button>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditing(agent)}
                    className="p-1 text-ink-dim hover:text-ink"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => remove(agent.id)}
                    className="p-1 text-ink-dim hover:text-[var(--color-term-red)]"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AgentForm({
  agent,
  options,
  onClose,
  onSaved,
}: {
  agent: Agent | null;
  options: ModelOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(agent?.name ?? "");
  const [emoji, setEmoji] = useState(agent?.emoji ?? "🤖");
  const [modelTag, setModelTag] = useState(agent?.modelTag ?? "");
  const [description, setDescription] = useState(agent?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? "");
  const [wikiDefault, setWikiDefault] = useState(agent?.wikiDefault ?? false);
  const [scopeId, setScopeId] = useState<string>(agent?.scopeId ?? "");
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/brain/scopes")
      .then((r) => r.json())
      .then((d) => setScopes(d.scopes ?? []));
  }, []);

  // Unique ollama model tags across all nodes.
  const tags = [...new Set(options.filter((o) => o.backend === "ollama").map((o) => o.label))];

  async function save() {
    if (!name.trim() || !modelTag) return;
    setSaving(true);
    const body = { id: agent?.id, name, emoji, modelTag, description, systemPrompt, wikiDefault, scopeId: scopeId || null };
    await fetch("/api/agents", {
      method: agent ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <Card className="p-4 mb-5">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            className="w-20 text-center text-2xl rounded bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1 focus:outline-none focus:border-accent"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="🤖"
          />
          <input
            className="flex-1 rounded bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent"
            placeholder="Agent name (e.g. Athena)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <select
          className="rounded bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-accent"
          value={modelTag}
          onChange={(e) => setModelTag(e.target.value)}
        >
          <option value="" disabled>
            Pick a model…
          </option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          {modelTag && !tags.includes(modelTag) && <option value={modelTag}>{modelTag} (offline)</option>}
        </select>
        <input
          className="rounded bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent"
          placeholder="Short description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <textarea
          className="rounded bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent"
          rows={2}
          placeholder="System prompt / persona (optional) — e.g. You are Athena, a scholarly guide to my library."
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
        <label className="flex items-center gap-2 text-xs text-ink-dim">
          <input
            type="checkbox"
            checked={wikiDefault}
            onChange={(e) => setWikiDefault(e.target.checked)}
          />
          Ground with Wikipedia by default
        </label>
        {scopes.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-ink-dim">
            Data scope
            <select
              className="flex-1 rounded bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent"
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
            >
              <option value="">All of Brain</option>
              {scopes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emoji ? `${s.emoji} ` : "◆ "}
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving || !name.trim() || !modelTag}>
            {saving ? "saving…" : agent ? "save" : "create agent"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}
