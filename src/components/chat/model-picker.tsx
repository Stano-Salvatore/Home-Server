"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ModelOption, ChatBackend } from "@/lib/types";

// "gemma4-e2b" -> "gemma4", "llama3.1:8b-instruct-q4_0" -> "llama3.1" — just
// enough to fit the closed button; the full label is still shown per-option
// in the open dropdown.
function shortLabel(label: string): string {
  const token = label.split(/[-\s:_]+/)[0] || label;
  return token.length > 16 ? token.slice(0, 16) : token;
}

export function ModelPicker({
  value,
  onChange,
  autoDefault,
}: {
  value: { backend: ChatBackend; modelId: string } | null;
  onChange: (v: { backend: ChatBackend; modelId: string; label: string }) => void;
  // Opt-in: when nothing is selected yet, pick the on-device litert-lm model
  // (the always-available default) as soon as options load, falling back to
  // the first option otherwise. Opt-in rather than universal because some
  // consumers treat onChange as an action, not a selection — Council adds a
  // participant the moment onChange fires, so auto-defaulting there would
  // auto-add a council member.
  autoDefault?: boolean;
}) {
  const [options, setOptions] = useState<ModelOption[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Ref'd so the auto-default effect doesn't need the (unstable, inline-arrow)
  // onChange prop in its dependency array. Synced in an effect, not during
  // render (the react-hooks/refs rule forbids render-time ref writes).
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => setOptions(data.options ?? []));
  }, []);

  useEffect(() => {
    if (!autoDefault || value || options.length === 0) return;
    // Deferred a tick so a consumer restoring its own stored choice (e.g. the
    // chat landing's last-used model from localStorage) wins the race — this
    // only fills genuinely empty pickers.
    const t = setTimeout(() => {
      // Prefer LiteRT-LM only when it's actually running — it's always present
      // in the list now (see registry.ts), but auto-selecting it while `serve`
      // is down would make a fresh chat fail on its first message. Fall back to
      // the first working option in that case.
      const opt =
        options.find((o) => o.backend === "litertlm" && !o.idle) ?? options[0];
      onChangeRef.current({ backend: opt.backend, modelId: opt.id, label: opt.label });
    }, 0);
    return () => clearTimeout(t);
  }, [autoDefault, value, options]);

  // Closed button shows a short label; full per-model detail lives in this
  // popover instead — a native <select> can't render a secondary detail line
  // per <option>, so the dropdown is hand-rolled.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = value
    ? options.find((o) => o.backend === value.backend && o.id === value.modelId)
    : undefined;
  const buttonLabel = selected
    ? `[${selected.nodeName ?? selected.backend}] ${shortLabel(selected.label)}`
    : "Select a model…";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1 max-w-[11rem] rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent"
      >
        <span className="truncate">{buttonLabel}</span>
        <ChevronDown size={13} className="shrink-0 text-ink-dim" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-20 mt-1 w-72 max-h-80 overflow-y-auto rounded-md border shadow-lg py-1"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-ink-dim">No models available.</div>
          )}
          {options.map((o) => {
            const isSelected = value?.backend === o.backend && value.modelId === o.id;
            const details = [
              o.backend,
              o.contextLength ? `${o.contextLength.toLocaleString()} ctx` : null,
              o.port ? `:${o.port}` : null,
              o.nodeName ?? null,
              o.idle ? "idle" : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <button
                key={`${o.backend}:${o.id}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange({ backend: o.backend, modelId: o.id, label: o.label });
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 transition-colors hover:bg-[var(--surface-2)] ${
                  isSelected ? "text-accent" : "text-ink"
                }`}
              >
                <div className="text-sm truncate">
                  [{o.nodeName ?? o.backend}] {o.label}
                </div>
                {details && <div className="text-[11px] text-ink-dim truncate">{details}</div>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
