"use client";

import { useState } from "react";
import { Moon, Snowflake, Power } from "lucide-react";

// Put the server to bed from wherever you are. The three states differ in what
// they cost while off and how long they take to come back:
//
//   sleep      ~4 W   back in seconds, wakes on Wake-on-LAN from the home network
//   hibernate  ~1 W   back in under a minute, and safe to cut mains afterwards
//   shutdown     0 W  a full boot, the state everything is proven to recover from
//
// Whichever is chosen, the containers are stopped gracefully first.

type Action = "sleep" | "hibernate" | "shutdown";

const CHOICES: { action: Action; label: string; icon: typeof Moon; blurb: string }[] = [
  { action: "sleep", label: "Sleep", icon: Moon, blurb: "~4 W · wakes in seconds" },
  { action: "hibernate", label: "Hibernate", icon: Snowflake, blurb: "~1 W · safe to cut the socket" },
  { action: "shutdown", label: "Shut down", icon: Power, blurb: "0 W · full boot to return" },
];

export function PowerCard() {
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function go(action: Action) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/system/power", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMsg(
        `Stopping ${data.stopped?.length ?? 0} services, then ${data.state}. ` +
          `This page will stop responding — that means it worked.`,
      );
    } catch (err) {
      // A dropped connection is the expected outcome of succeeding.
      setMsg(
        err instanceof TypeError
          ? "The server went down as asked."
          : `Could not do it: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <h2 className="mb-1 font-mono text-xs font-bold uppercase tracking-wide text-ink-dim">
        Power
      </h2>
      <p className="mb-3 text-xs text-ink-dim">
        Stops every service cleanly, then puts this machine into the chosen state.
        Switch the smart plug back on to start it again.
      </p>

      <div className="flex flex-wrap gap-2">
        {CHOICES.map(({ action, label, icon: Icon, blurb }) => (
          <button
            key={action}
            onClick={() => setPending(action)}
            disabled={busy}
            className="flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors hover:border-accent disabled:opacity-50"
            style={{ borderColor: pending === action ? "var(--accent)" : "var(--border)" }}
          >
            <span className="flex items-center gap-1.5 text-sm text-ink">
              <Icon size={14} /> {label}
            </span>
            <span className="font-mono text-[10px] text-ink-dim">{blurb}</span>
          </button>
        ))}
      </div>

      {pending && (
        <div
          className="mt-3 rounded-lg border p-3"
          style={{ borderColor: "var(--accent)", background: "var(--surface-2)" }}
        >
          <p className="mb-2 text-sm text-ink">
            {pending === "sleep" && "Sleep the server? Wake it with Wake-on-LAN from the home network."}
            {pending === "hibernate" && "Hibernate the server? Afterwards the socket can be switched off safely."}
            {pending === "shutdown" && "Shut the server down? Everything stops until the plug is switched back on."}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => void go(pending)}
              disabled={busy}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40"
            >
              {busy ? "Working…" : "Yes, do it"}
            </button>
            <button
              onClick={() => setPending(null)}
              disabled={busy}
              className="rounded-lg border px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
              style={{ borderColor: "var(--border)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && <p className="mt-3 text-xs text-ink-dim">{msg}</p>}
    </div>
  );
}
