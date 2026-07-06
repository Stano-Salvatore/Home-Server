"use client";

import { useCallback, useEffect, useState } from "react";
import { HardwareCard } from "@/components/cookbook/hardware-card";
import { ModelTable } from "@/components/cookbook/model-table";
import { RunningPanel } from "@/components/cookbook/running-panel";
import type { HardwareInfo, ScoredModel, ModelOption, LlamaCppServerRow } from "@/lib/types";

export default function CookbookPage() {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [models, setModels] = useState<ScoredModel[]>([]);
  const [installedTags, setInstalledTags] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<ModelOption[]>([]);
  const [llamacppServers, setLlamacppServers] = useState<LlamaCppServerRow[]>([]);
  const [rescanning, setRescanning] = useState(false);

  const fetchCatalog = useCallback(async () => {
    const res = await fetch("/api/models/catalog");
    return res.json() as Promise<{ hardware: HardwareInfo; models: ScoredModel[] }>;
  }, []);

  const fetchRunning = useCallback(async () => {
    const [modelsRes, tagsRes] = await Promise.all([
      fetch("/api/models"),
      fetch("/api/models/ollama/tags"),
    ]);
    const modelsData = await modelsRes.json();
    const tagsData = await tagsRes.json();
    return {
      options: modelsData.options as ModelOption[],
      llamacppServers: modelsData.llamacppServers as LlamaCppServerRow[],
      installedTags: new Set<string>((tagsData.tags ?? []).map((t: { name: string }) => t.name)),
    };
  }, []);

  const loadCatalog = useCallback(async () => {
    const data = await fetchCatalog();
    setHardware(data.hardware);
    setModels(data.models);
  }, [fetchCatalog]);

  const loadRunning = useCallback(async () => {
    const data = await fetchRunning();
    setOptions(data.options);
    setLlamacppServers(data.llamacppServers);
    setInstalledTags(data.installedTags);
  }, [fetchRunning]);

  useEffect(() => {
    fetchCatalog().then((data) => {
      setHardware(data.hardware);
      setModels(data.models);
    });
    fetchRunning().then((data) => {
      setOptions(data.options);
      setLlamacppServers(data.llamacppServers);
      setInstalledTags(data.installedTags);
    });
  }, [fetchCatalog, fetchRunning]);

  async function rescan() {
    setRescanning(true);
    try {
      await fetch("/api/hardware", { method: "POST" });
      await loadCatalog();
    } finally {
      setRescanning(false);
    }
  }

  return (
    <div className="p-8 flex flex-col gap-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-neutral-100 mb-1">Cookbook</h1>
        <p className="text-sm text-neutral-500">
          Scans your hardware and scores which local models will actually run well.
        </p>
      </div>

      <HardwareCard hardware={hardware} rescanning={rescanning} onRescan={rescan} />

      <RunningPanel options={options} llamacppServers={llamacppServers} onChanged={loadRunning} />

      <div>
        <h2 className="text-sm font-semibold text-neutral-200 mb-3">Model catalog</h2>
        {models.length === 0 ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : (
          <ModelTable
            models={models}
            installedTags={installedTags}
            onPulled={loadRunning}
          />
        )}
      </div>
    </div>
  );
}
