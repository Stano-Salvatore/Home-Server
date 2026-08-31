import { probeNodes } from "@/server/backends/registry";
import { litertlmModelId } from "@/server/backends/litertlm";
import { parseOllamaTarget, makeOllamaTarget, getNode } from "@/server/nodes/nodes";
import type { BackendKind } from "@/server/backends/types";

// A concrete place a reply can be generated: backend + target, plus the
// node's display name so the UI can say which machine answered.
export type ChatRoute = { backend: BackendKind; modelId: string; nodeName?: string };

// Persisted on assistant messages (messages.via_json) so a reply that came
// from somewhere other than the conversation's configured target says so
// permanently — a silent downgrade is how "the AI got worse" goes unnoticed
// for weeks. `fallbackFrom` is present only when the route differs from what
// the conversation asked for.
export type ChatVia = ChatRoute & { fallbackFrom?: ChatRoute };

/** The conversation's own target, resolved to a route with a display name. */
export function primaryRoute(backend: BackendKind, modelId: string): ChatRoute {
  if (backend === "ollama") {
    const { nodeId } = parseOllamaTarget(modelId);
    return { backend, modelId, nodeName: (nodeId ? getNode(nodeId)?.name : undefined) ?? undefined };
  }
  if (backend === "litertlm") return { backend, modelId, nodeName: "on-device" };
  return { backend, modelId };
}

/** Short human label: "qwen3:14b @ ryzen", "gemma (on-device)". */
export function describeRoute(r: ChatRoute): string {
  const tag = r.backend === "ollama" ? parseOllamaTarget(r.modelId).tag : r.modelId;
  return r.nodeName ? `${tag} @ ${r.nodeName}` : tag;
}

// Ordered alternates for when the primary route can't produce a single
// token (node asleep, unplugged, off the tailnet). Mirrors the fleet's
// fallback chain: same model on any other online Ollama node first (in the
// user's node order), then litert-lm — the always-available on-device
// backend — as the last resort. litert-lm gets no alternates of its own:
// when the on-device model is down there is nothing further to degrade to,
// and inventing one would just hide the real error.
export async function fallbackRoutes(primary: ChatRoute): Promise<ChatRoute[]> {
  const routes: ChatRoute[] = [];
  if (primary.backend === "ollama") {
    const { nodeId, tag } = parseOllamaTarget(primary.modelId);
    try {
      const nodes = await probeNodes();
      for (const n of nodes) {
        if (n.id === nodeId || !n.online) continue;
        if (!n.installed.includes(tag)) continue;
        routes.push({ backend: "ollama", modelId: makeOllamaTarget(n.id, tag), nodeName: n.name });
      }
    } catch {
      // Health probing itself failing means no Ollama alternates — fall
      // through to the on-device route rather than aborting the chain.
    }
  }
  if (primary.backend !== "litertlm") {
    routes.push({ backend: "litertlm", modelId: litertlmModelId(), nodeName: "on-device" });
  }
  return routes;
}
