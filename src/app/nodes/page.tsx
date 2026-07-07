"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Server, Cpu, Trash2, Plus, RotateCw } from "lucide-react";

type NodeStatus = {
  id: string;
  name: string;
  url: string;
  online: boolean;
  loaded: string[];
  installed: string[];
};

type LlamaServer = { id: string; name: string; port: number; status: string };

export default function NodesPage() {
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [llamacpp, setLlamacpp] = useState<LlamaServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const fetchNodes = useCallback(
    () => fetch("/api/nodes").then((r) => r.json()),
    [],
  );

  const apply = useCallback((data: { nodes?: NodeStatus[]; llamacppServers?: LlamaServer[] }) => {
    setNodes(data.nodes ?? []);
    setLlamacpp((data.llamacppServers ?? []).filter((s) => s.status === "running"));
    setLoading(false);
  }, []);

  const load = useCallback(() => {
    fetchNodes().then(apply);
  }, [fetchNodes, apply]);

  useEffect(() => {
    fetchNodes().then(apply);
  }, [fetchNodes, apply]);

  async function addNode() {
    if (!newName.trim() || !newUrl.trim()) return;
    await fetch("/api/nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, url: newUrl }),
    });
    setNewName("");
    setNewUrl("");
    setAdding(false);
    setLoading(true);
    load();
  }

  async function removeNode(id: string) {
    await fetch("/api/nodes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <span className="text-accent">◢</span> nodes
        </h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => { setLoading(true); load(); }}>
            <RotateCw size={14} /> refresh
          </Button>
          <Button variant="secondary" onClick={() => setAdding(!adding)}>
            {adding ? "cancel" : <><Plus size={14} /> add node</>}
          </Button>
        </div>
      </div>
      <p className="text-sm text-ink-dim mb-6">
        Where your AI lives. Each node is a device running Ollama on your network.
      </p>

      {adding && (
        <Card className="p-4 mb-5">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              className="rounded bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent"
              placeholder="Name (e.g. S21 Ultra)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="rounded bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent"
              placeholder="http://100.126.149.29:11434"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
          </div>
          <Button onClick={addNode} disabled={!newName.trim() || !newUrl.trim()}>
            add node
          </Button>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-ink-dim">probing nodes…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {nodes.map((node) => (
            <Card key={node.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <Server size={18} className={node.online ? "text-accent" : "text-ink-dim"} />
                  <div>
                    <div className="text-ink font-semibold flex items-center gap-2">
                      {node.name}
                      <Badge color={node.online ? "green" : "red"}>
                        {node.online ? "online" : "offline"}
                      </Badge>
                    </div>
                    <div className="text-xs text-ink-dim mt-0.5">{node.url}</div>
                  </div>
                </div>
                {nodes.length > 1 && (
                  <button
                    onClick={() => removeNode(node.id)}
                    className="text-ink-dim hover:text-[var(--color-term-red)] p-1"
                    title="Remove node"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              {node.online ? (
                node.installed.length > 0 ? (
                  <div className="mt-4">
                    <div className="text-xs uppercase tracking-wide text-ink-dim mb-2">
                      Models on this node ({node.installed.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {node.installed.map((tag) => {
                        const loaded = node.loaded.includes(tag);
                        return (
                          <span
                            key={tag}
                            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${
                              loaded
                                ? "border-[var(--color-term-green)]/40 text-[var(--color-term-green)]"
                                : "border-[var(--border)] text-ink-dim"
                            }`}
                            title={loaded ? "loaded in memory" : "installed"}
                          >
                            {loaded && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-term-green)]" />}
                            {tag}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 text-sm text-ink-dim">
                    No models yet. On that device run:{" "}
                    <code className="text-accent">ollama pull &lt;model&gt;</code>
                  </div>
                )
              ) : (
                <div className="mt-4 text-sm text-ink-dim">
                  Can&apos;t reach this node. Make sure Ollama is running there with{" "}
                  <code className="text-accent">OLLAMA_HOST=0.0.0.0:11434 ollama serve</code> and the
                  address is reachable from this device.
                </div>
              )}
            </Card>
          ))}

          {llamacpp.length > 0 && (
            <Card className="p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <Cpu size={18} className="text-accent" />
                <div className="text-ink font-semibold">This device — llama.cpp servers</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {llamacpp.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 rounded border border-[var(--color-term-green)]/40 text-[var(--color-term-green)] px-2 py-0.5 text-xs"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-term-green)]" />
                    {s.name} :{s.port}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
