import { newId } from "@/server/util/hash";
import { readJsonBlob, writeJsonBlob, isArray } from "@/server/settings/jsonBlob";

// User-drawn nodes in the Brain graph — labels, colours and a link to a parent
// node — so the mesh isn't limited to what's auto-derived from files/agents.
export type CustomNode = {
  id: string;
  label: string;
  color: string;
  emoji?: string;
  parentId?: string; // node id this connects to; defaults to the hub
};

const KEY = "brain_custom_nodes";

export function listCustomNodes(): CustomNode[] {
  return readJsonBlob<CustomNode[]>(KEY, [], isArray as (v: unknown) => v is CustomNode[]);
}

function save(nodes: CustomNode[]) {
  writeJsonBlob(KEY, nodes);
}

export function addCustomNode(input: Partial<CustomNode>): CustomNode {
  const node: CustomNode = {
    id: newId("cnode"),
    label: (input.label ?? "New node").trim() || "New node",
    color: input.color ?? "#e06c75",
    emoji: input.emoji?.trim() || undefined,
    parentId: input.parentId || "hub",
  };
  save([...listCustomNodes(), node]);
  return node;
}

export function updateCustomNode(id: string, patch: Partial<Omit<CustomNode, "id">>): CustomNode | undefined {
  const nodes = listCustomNodes();
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx === -1) return undefined;
  nodes[idx] = {
    ...nodes[idx],
    ...(patch.label !== undefined ? { label: patch.label.trim() || "Node" } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {}),
    ...(patch.emoji !== undefined ? { emoji: patch.emoji || undefined } : {}),
    ...(patch.parentId !== undefined ? { parentId: patch.parentId || "hub" } : {}),
  };
  save(nodes);
  return nodes[idx];
}

export function deleteCustomNode(id: string) {
  // Also detach any children that pointed at this node, back to the hub.
  const nodes = listCustomNodes()
    .filter((n) => n.id !== id)
    .map((n) => (n.parentId === id ? { ...n, parentId: "hub" } : n));
  save(nodes);
}
