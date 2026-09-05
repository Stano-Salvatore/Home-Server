"use client";

import { useEffect, useState } from "react";
import { Users, Clock, Brain, Wrench, Globe } from "lucide-react";

// Who works here, and what runs while nobody is watching.
//
// The thing this page exists to answer is "what can each agent actually see?"
// — an agent limited to a Brain scope is faster and sharper, and until now the
// only way to know which scope was to open its settings one at a time.

type Agent = {
  id: string;
  name: string;
  emoji: string;
  modelTag: string;
  description?: string;
  scopeId?: string | null;
  toolsEnabled?: boolean;
  wikiDefault?: boolean;
  color?: string;
};
type Scope = { id: string; label: string; emoji?: string; color: string };
type Job = { name: string; kind: string; detail: string; schedule?: string; lastRun?: string; status?: string };

export default function TeamPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [members, setMembers] = useState<Record<string, string[]>>({});
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  useEffect(() => {
    fetch("/api/agents").then((r) => r.json()).then((d) => setAgents(d.agents ?? d ?? []));
    fetch("/api/brain/scopes").then((r) => r.json()).then((d) => {
      setScopes(d.scopes ?? []);
      setMembers(d.members ?? {});
    });
    fetch("/api/system/jobs")
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? []))
      .finally(() => setLoadingJobs(false));
  }, []);

  const scopeOf = (id?: string | null) => scopes.find((s) => s.id === id);
  const model = (tag: string) => tag.replace(/:latest$/, "");

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-1 flex items-center gap-2 text-lg font-bold text-ink">
        <Users size={18} className="text-accent" /> team
      </h1>
      <p className="mb-6 text-sm text-ink-dim">
        Every agent, the model behind it, and — the part that decides how sharp its
        answers are — exactly which part of the Brain it can read.
      </p>

      <div className="mb-9 grid gap-3 sm:grid-cols-2">
        {agents.map((a) => {
          const scope = scopeOf(a.scopeId);
          const count = a.scopeId ? (members[a.scopeId] ?? []).length : null;
          return (
            <div
              key={a.id}
              className="rounded-xl border p-4"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-lg">{a.emoji}</span>
                <span className="font-semibold text-ink">{a.name}</span>
                <span className="ml-auto font-mono text-[11px] text-ink-dim">{model(a.modelTag)}</span>
              </div>
              {a.description && <p className="mb-2.5 text-xs text-ink-dim">{a.description}</p>}

              <div className="flex flex-wrap gap-1.5">
                <span
                  className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px]"
                  style={{
                    borderColor: scope ? scope.color : "var(--border)",
                    color: scope ? scope.color : "var(--color-ink-dim)",
                  }}
                  title={
                    scope
                      ? `Reads only this shelf — ${count} documents`
                      : "Reads the whole Brain, which is slower and noisier"
                  }
                >
                  <Brain size={10} />
                  {scope ? `${scope.emoji ?? ""} ${scope.label} · ${count}` : "whole Brain"}
                </span>
                {a.toolsEnabled && (
                  <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] text-ink-dim" style={{ borderColor: "var(--border)" }}>
                    <Wrench size={10} /> tools
                  </span>
                )}
                {a.wikiDefault && (
                  <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] text-ink-dim" style={{ borderColor: "var(--border)" }}>
                    <Globe size={10} /> wikipedia
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-ink">
        <Clock size={18} className="text-accent" /> what runs by itself
      </h2>
      <p className="mb-4 text-sm text-ink-dim">
        Discovered from the machine, not from a list kept here — so it cannot quietly
        go out of date.
      </p>

      {loadingJobs ? (
        <p className="text-sm text-ink-dim">reading the machine…</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-ink-dim">Nothing scheduled found.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <table className="w-full text-sm">
            <tbody>
              {jobs.map((j, i) => (
                <tr key={`${j.name}-${i}`} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-ink">{j.name}</td>
                  <td className="px-4 py-2 text-xs text-ink-dim">{j.detail}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-[11px] text-ink-dim">
                    {j.schedule ?? j.status ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
