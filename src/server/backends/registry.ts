import { listLoadedModels, listInstalledTags, isOllamaReachable, ollamaBackend } from "./ollama";
import { llamaCppBackend } from "./llamacpp";
import type { ModelBackend, RunningModel } from "./types";

export type ModelOption = RunningModel & { idle?: boolean };

export async function listAllModelOptions(): Promise<ModelOption[]> {
  const [loaded, tags, llamacppRunning, ollamaUp] = await Promise.all([
    listLoadedModels(),
    listInstalledTags(),
    llamaCppBackend.listRunning(),
    isOllamaReachable(),
  ]);

  const loadedNames = new Set(loaded.map((m) => m.id));
  const idleOllama: ModelOption[] = ollamaUp
    ? tags
        .filter((t) => !loadedNames.has(t.name))
        .map((t) => ({ id: t.name, backend: "ollama" as const, label: t.name, idle: true }))
    : [];

  return [...loaded, ...idleOllama, ...llamacppRunning];
}

export function backendFor(kind: "ollama" | "llamacpp"): ModelBackend {
  return kind === "ollama" ? ollamaBackend : llamaCppBackend;
}
