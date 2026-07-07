import { listLoadedModels, listInstalledTags, isOllamaReachable, ollamaBackend } from "./ollama";
import { llamaCppBackend } from "./llamacpp";
import { listNodes, makeOllamaTarget } from "@/server/nodes/nodes";
import type { ModelBackend, RunningModel } from "./types";

export type ModelOption = RunningModel & { idle?: boolean; nodeId?: string; nodeName?: string };

export type NodeStatus = {
  id: string;
  name: string;
  url: string;
  online: boolean;
  loaded: string[]; // tags currently loaded in memory
  installed: string[]; // all installed tags
};

/** Probe every Ollama node: reachability + loaded/installed models. */
export async function probeNodes(): Promise<NodeStatus[]> {
  const nodes = listNodes();
  return Promise.all(
    nodes.map(async (node): Promise<NodeStatus> => {
      const [online, loaded, installed] = await Promise.all([
        isOllamaReachable(node.url),
        listLoadedModels(node.url),
        listInstalledTags(node.url),
      ]);
      return {
        id: node.id,
        name: node.name,
        url: node.url,
        online,
        loaded: loaded.map((m) => m.id),
        installed: installed.map((t) => t.name),
      };
    }),
  );
}

/** Every selectable model across all nodes, plus running llama.cpp servers. */
export async function listAllModelOptions(): Promise<ModelOption[]> {
  const [nodeStatuses, llamacppRunning] = await Promise.all([
    probeNodes(),
    llamaCppBackend.listRunning(),
  ]);

  const ollamaOptions: ModelOption[] = [];
  for (const node of nodeStatuses) {
    if (!node.online) continue;
    const loadedSet = new Set(node.loaded);
    for (const tag of node.installed) {
      ollamaOptions.push({
        id: makeOllamaTarget(node.id, tag),
        backend: "ollama",
        label: tag,
        idle: !loadedSet.has(tag),
        nodeId: node.id,
        nodeName: node.name,
      });
    }
  }

  return [...ollamaOptions, ...llamacppRunning];
}

export function backendFor(kind: "ollama" | "llamacpp"): ModelBackend {
  return kind === "ollama" ? ollamaBackend : llamaCppBackend;
}
