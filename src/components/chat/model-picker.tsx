"use client";

import { useEffect, useState } from "react";
import type { ModelOption } from "@/lib/types";

export function ModelPicker({
  value,
  onChange,
}: {
  value: { backend: "ollama" | "llamacpp"; modelId: string } | null;
  onChange: (v: { backend: "ollama" | "llamacpp"; modelId: string; label: string }) => void;
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
      className="rounded-md bg-neutral-950 border border-neutral-800 px-2 py-1 text-sm text-neutral-100"
      value={selectedKey}
      onChange={(e) => {
        const [backend, ...rest] = e.target.value.split(":");
        const modelId = rest.join(":");
        const opt = options.find((o) => o.backend === backend && o.id === modelId);
        if (opt) onChange({ backend: backend as "ollama" | "llamacpp", modelId, label: opt.label });
      }}
    >
      <option value="" disabled>
        Select a model…
      </option>
      {options.map((o) => (
        <option key={`${o.backend}:${o.id}`} value={`${o.backend}:${o.id}`}>
          [{o.backend}] {o.label}
          {o.idle ? " (idle)" : ""}
        </option>
      ))}
    </select>
  );
}
