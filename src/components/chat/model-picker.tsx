"use client";

import { useEffect, useRef, useState } from "react";
import type { ModelOption, ChatBackend } from "@/lib/types";

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
      const opt = options.find((o) => o.backend === "litertlm") ?? options[0];
      onChangeRef.current({ backend: opt.backend, modelId: opt.id, label: opt.label });
    }, 0);
    return () => clearTimeout(t);
  }, [autoDefault, value, options]);

  const selectedKey = value ? `${value.backend}:${value.modelId}` : "";

  return (
    <select
      className="rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent"
      value={selectedKey}
      onChange={(e) => {
        const [backend, ...rest] = e.target.value.split(":");
        const modelId = rest.join(":");
        const opt = options.find((o) => o.backend === backend && o.id === modelId);
        if (opt) onChange({ backend: backend as ChatBackend, modelId, label: opt.label });
      }}
    >
      <option value="" disabled>
        Select a model…
      </option>
      {options.map((o) => (
        <option key={`${o.backend}:${o.id}`} value={`${o.backend}:${o.id}`}>
          [{o.nodeName ?? o.backend}] {o.label}
          {o.idle ? " (idle)" : ""}
        </option>
      ))}
    </select>
  );
}
