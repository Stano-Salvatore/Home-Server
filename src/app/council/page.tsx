"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "@/components/chat/model-picker";
import { Send, Square, Sparkles, Plus, X } from "lucide-react";
import type { ModelOption, ChatBackend } from "@/lib/types";
import { resolveAgentOption } from "@/lib/agentModel";
import { friendlyError } from "@/lib/friendlyError";
import { Markdown } from "@/components/chat/markdown";
import { ThinkingSpiral } from "@/components/ui/thinking-spiral";

type Agent = { id: string; name: string; emoji: string; modelTag: string; systemPrompt?: string; wikiDefault?: boolean; color?: string };

type Participant = {
  key: string;
  name: string;
  emoji: string;
  color: string;
  backend: ChatBackend;
  modelId: string;
  systemPrompt?: string;
  wikiDefault?: boolean;
};

type Answer = { content: string; running: boolean; error?: string };

// Read an SSE stream of {delta}/{error} events, calling back per delta.
async function streamAsk(
  body: unknown,
  signal: AbortSignal,
  onDelta: (s: string) => void,
  onError: (s: string) => void,
) {
  const res = await fetch("/api/council/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.body) throw new Error("No stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split("\n\n");
    buf = events.pop() ?? "";
    for (const evt of events) {
      const line = evt.replace(/^data:\s*/, "").trim();
      if (!line) continue;
      const data = JSON.parse(line);
      if (data.error) onError(data.error);
      else if (data.delta) onDelta(data.delta);
    }
  }
}

export default function CouncilPage() {
  const [options, setOptions] = useState<ModelOption[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [prompt, setPrompt] = useState("");
  const [wiki, setWiki] = useState(true);
  const [brain, setBrain] = useState(false);
  // Default to one-at-a-time: several 7B models at once will OOM a single phone.
  const [sequential, setSequential] = useState(true);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [running, setRunning] = useState(false);
  const [addingModel, setAddingModel] = useState(false);
  const [synthesis, setSynthesis] = useState<Answer | null>(null);
  const [judge, setJudge] = useState<{ backend: ChatBackend; modelId: string } | null>(null);
  const abortsRef = useRef<AbortController[]>([]);
  const stoppedRef = useRef(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/agents").then((r) => r.json()),
      fetch("/api/models").then((r) => r.json()),
    ]).then(([agentsData, modelsData]) => {
      const opts: ModelOption[] = modelsData.options ?? [];
      setOptions(opts);
      const agents: Agent[] = agentsData.agents ?? [];
      // Seed the council with every agent whose model is actually available.
      const seeded: Participant[] = [];
      for (const a of agents) {
        const opt = resolveAgentOption(a.modelTag, opts);
        if (!opt) continue;
        seeded.push({
          key: `agent:${a.id}`,
          name: a.name,
          emoji: a.emoji,
          color: a.color ?? "#e06c75",
          backend: "ollama",
          modelId: opt.id,
          systemPrompt: a.systemPrompt,
          wikiDefault: a.wikiDefault,
        });
      }
      setParticipants(seeded);
      if (seeded[0]) setJudge({ backend: seeded[0].backend, modelId: seeded[0].modelId });
    });
  }, []);

  function removeParticipant(key: string) {
    setParticipants((prev) => prev.filter((p) => p.key !== key));
  }

  function addModel(v: { backend: ChatBackend; modelId: string; label: string }) {
    const key = `model:${v.backend}:${v.modelId}`;
    setParticipants((prev) =>
      prev.some((p) => p.key === key)
        ? prev
        : [...prev, { key, name: v.label, emoji: "🧩", color: "#8a8d96", backend: v.backend, modelId: v.modelId }],
    );
    setAddingModel(false);
  }

  function stop() {
    stoppedRef.current = true;
    abortsRef.current.forEach((c) => c.abort());
    abortsRef.current = [];
    setRunning(false);
  }

  async function ask() {
    const q = prompt.trim();
    if (!q || participants.length === 0 || running) return;
    setSynthesis(null);
    setRunning(true);
    stoppedRef.current = false;
    setAnswers(Object.fromEntries(participants.map((p) => [p.key, { content: "", running: sequential ? false : true }])));
    abortsRef.current = [];

    const runOne = async (p: Participant) => {
      const ctrl = new AbortController();
      abortsRef.current.push(ctrl);
      setAnswers((prev) => ({ ...prev, [p.key]: { ...prev[p.key], running: true } }));
      try {
        await streamAsk(
          { backend: p.backend, modelId: p.modelId, prompt: q, systemPrompt: p.systemPrompt, wikiEnabled: wiki && (p.wikiDefault ?? true), ragEnabled: brain },
          ctrl.signal,
          (d) => setAnswers((prev) => ({ ...prev, [p.key]: { ...prev[p.key], content: (prev[p.key]?.content ?? "") + d } })),
          (e) => setAnswers((prev) => ({ ...prev, [p.key]: { ...prev[p.key], error: friendlyError(e) } })),
        );
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setAnswers((prev) => ({ ...prev, [p.key]: { ...prev[p.key], error: friendlyError(err.message) } }));
        }
      } finally {
        setAnswers((prev) => ({ ...prev, [p.key]: { ...prev[p.key], running: false } }));
      }
    };

    if (sequential) {
      // One model at a time: safe for a single phone's RAM.
      for (const p of participants) {
        if (stoppedRef.current) break;
        await runOne(p);
      }
    } else {
      await Promise.all(participants.map(runOne));
    }
    setRunning(false);
  }

  async function synthesize() {
    if (!judge) return;
    const parts = participants
      .map((p) => {
        const a = answers[p.key];
        return a?.content ? `### ${p.name}\n${a.content}` : null;
      })
      .filter(Boolean)
      .join("\n\n");
    if (!parts) return;
    const judgePrompt = `The question was:\n\n"${prompt.trim()}"\n\nSeveral assistants answered:\n\n${parts}\n\nCompare these answers. Note where they agree and disagree, call out any that are wrong, and give the single best consolidated answer.`;
    setSynthesis({ content: "", running: true });
    const ctrl = new AbortController();
    abortsRef.current.push(ctrl);
    try {
      await streamAsk(
        { backend: judge.backend, modelId: judge.modelId, prompt: judgePrompt, systemPrompt: "You are the council's chair — a sharp, fair judge who synthesizes multiple answers into the best one.", wikiEnabled: false },
        ctrl.signal,
        (d) => setSynthesis((prev) => ({ content: (prev?.content ?? "") + d, running: true })),
        (e) => setSynthesis((prev) => ({ content: prev?.content ?? "", running: true, error: friendlyError(e) })),
      );
    } finally {
      setSynthesis((prev) => (prev ? { ...prev, running: false } : null));
    }
  }

  const answered = participants.some((p) => answers[p.key]?.content && !answers[p.key]?.running);

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col h-full">
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-xl font-semibold text-ink">Council</h1>
        <span className="text-xs text-ink-dim">ask once, hear everyone</span>
      </div>
      <p className="text-sm text-ink-dim mb-4">
        Put your agents (and any raw model) side by side on the same question — then let the chair
        synthesize the best answer. Two models alone is a straight Compare.
      </p>

      {/* participants */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {participants.map((p) => (
          <span
            key={p.key}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
            style={{ borderColor: p.color, color: "var(--ink)" }}
          >
            <span>{p.emoji}</span>
            {p.name}
            <button onClick={() => removeParticipant(p.key)} className="text-ink-dim hover:text-accent">
              <X size={12} />
            </button>
          </span>
        ))}
        {addingModel ? (
          <span className="inline-flex items-center gap-1">
            <ModelPicker value={null} onChange={addModel} />
            <button onClick={() => setAddingModel(false)} className="text-ink-dim hover:text-ink text-xs">cancel</button>
          </span>
        ) : (
          <button onClick={() => setAddingModel(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-ink-dim hover:text-ink" style={{ borderColor: "var(--border)" }}>
            <Plus size={12} /> model
          </button>
        )}
      </div>

      {/* prompt */}
      <div className="flex gap-2 mb-4">
        <textarea
          className="flex-1 resize-none rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent"
          rows={2}
          placeholder="Ask the council…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask();
            }
          }}
        />
        <div className="flex flex-col gap-2">
          {running ? (
            <Button variant="danger" onClick={stop}><Square size={14} /> Stop</Button>
          ) : (
            <Button onClick={ask} disabled={!prompt.trim() || participants.length === 0}><Send size={14} /> Ask</Button>
          )}
          <label className="flex items-center gap-1.5 text-xs text-ink-dim justify-center">
            <input type="checkbox" checked={wiki} onChange={() => setWiki((v) => !v)} /> Wiki
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-dim justify-center">
            <input type="checkbox" checked={brain} onChange={() => setBrain((v) => !v)} /> Brain
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-dim justify-center" title="Run one model at a time — safe for a single phone's RAM">
            <input type="checkbox" checked={sequential} onChange={() => setSequential((v) => !v)} /> 1×1
          </label>
        </div>
      </div>

      {/* columns */}
      <div className="flex-1 overflow-y-auto">
        {participants.length === 0 ? (
          <p className="text-sm text-ink-dim">Add at least one agent or model above.</p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(260px, 1fr))` }}>
            {participants.map((p) => {
              const a = answers[p.key];
              return (
                <div key={p.key} className="rounded-lg border flex flex-col" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <div className="flex items-center gap-2 px-3 py-2 border-b text-sm" style={{ borderColor: "var(--border)" }}>
                    <span>{p.emoji}</span>
                    <span className="font-medium" style={{ color: p.color }}>{p.name}</span>
                    {a?.running && <ThinkingSpiral size={12} className="ml-auto text-accent" />}
                  </div>
                  <div className="p-3 text-sm text-ink min-h-[60px]">
                    {a?.error ? (
                      <span className="text-red-400 text-xs">{a.error}</span>
                    ) : a?.content ? (
                      <Markdown content={a.content} />
                    ) : a?.running ? (
                      <span className="text-accent"><ThinkingSpiral /></span>
                    ) : (
                      <span className="text-ink-dim text-xs">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {answered && (
          <div className="mt-4 rounded-lg border p-3" style={{ borderColor: "var(--accent)", background: "var(--surface)" }}>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Sparkles size={15} className="text-accent" />
              <span className="text-sm font-semibold text-ink">Chair&apos;s synthesis</span>
              <span className="flex-1" />
              <ModelPicker value={judge} onChange={(v) => setJudge(v)} />
              <Button variant="secondary" onClick={synthesize} disabled={synthesis?.running}>
                {synthesis?.running ? "Synthesizing…" : "Synthesize"}
              </Button>
            </div>
            {synthesis && (
              <div className="text-sm text-ink">
                {synthesis.error && <span className="text-red-400 text-xs">{synthesis.error}</span>}
                {synthesis.content ? (
                  <Markdown content={synthesis.content} />
                ) : synthesis.running ? (
                  <span className="text-accent"><ThinkingSpiral /></span>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
