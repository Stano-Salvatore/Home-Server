import { getSetting, setSetting, loadSettings } from "@/server/settings/config";
import { newId } from "@/server/util/hash";

export type OllamaNode = { id: string; name: string; url: string };

const NODES_KEY = "ollama_nodes";

function normalizeUrl(url: string): string {
  let u = url.trim();
  if (!/^https?:\/\//.test(u)) u = `http://${u}`;
  return u.replace(/\/$/, "");
}

export function listNodes(): OllamaNode[] {
  const raw = getSetting(NODES_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as OllamaNode[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // fall through to seed
    }
  }
  // Seed a first node from the existing single ollamaHost setting so upgrades
  // keep working with zero config.
  const seeded: OllamaNode[] = [
    { id: newId("node"), name: "Local", url: normalizeUrl(loadSettings().ollamaHost) },
  ];
  setSetting(NODES_KEY, JSON.stringify(seeded));
  return seeded;
}

function saveNodes(nodes: OllamaNode[]) {
  setSetting(NODES_KEY, JSON.stringify(nodes));
}

export function getNode(id: string): OllamaNode | undefined {
  return listNodes().find((n) => n.id === id);
}

/** Host URL for a node id, falling back to the first node then the raw setting. */
export function resolveHost(nodeId?: string): string {
  const nodes = listNodes();
  const node = nodeId ? nodes.find((n) => n.id === nodeId) : undefined;
  return normalizeUrl((node ?? nodes[0])?.url ?? loadSettings().ollamaHost);
}

/** The node used for embeddings / default operations. */
export function defaultNode(): OllamaNode {
  return listNodes()[0];
}

export function addNode(name: string, url: string): OllamaNode {
  const node: OllamaNode = { id: newId("node"), name: name.trim() || "node", url: normalizeUrl(url) };
  saveNodes([...listNodes(), node]);
  return node;
}

export function updateNode(id: string, patch: Partial<Pick<OllamaNode, "name" | "url">>): OllamaNode | undefined {
  const nodes = listNodes();
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx === -1) return undefined;
  nodes[idx] = {
    ...nodes[idx],
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.url !== undefined ? { url: normalizeUrl(patch.url) } : {}),
  };
  saveNodes(nodes);
  return nodes[idx];
}

export function deleteNode(id: string) {
  const nodes = listNodes().filter((n) => n.id !== id);
  // Never leave zero nodes — Chat needs at least one host to target.
  saveNodes(nodes.length > 0 ? nodes : listNodes());
}

/** Parse a chat/task ollama target of the form `nodeId::tag` (or legacy `tag`). */
export function parseOllamaTarget(target: string): { nodeId?: string; tag: string } {
  const sep = target.indexOf("::");
  if (sep === -1) return { tag: target };
  return { nodeId: target.slice(0, sep), tag: target.slice(sep + 2) };
}

export function makeOllamaTarget(nodeId: string, tag: string): string {
  return `${nodeId}::${tag}`;
}
