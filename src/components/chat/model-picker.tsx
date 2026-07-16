"use client";

import { useEffect, useState } from "react";
import type { ModelOption, ChatBackend } from "@/lib/types";

export function ModelPicker({
  value,
  onChange,
}: {
  value: { backend: ChatBackend; modelId: string } | null;
  onChange: (v: { backend: ChatBackend; modelId: string; label: string }) => void;
}) {
  const [options, setOptions] = useState<ModelOption[]>([]);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => setOptions(data.options ?? []));
  }, []);

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
