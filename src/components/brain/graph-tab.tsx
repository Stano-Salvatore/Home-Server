"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Spline, Link2, Unlink } from "lucide-react";
import type { ModelOption } from "@/lib/types";
import { resolveAgentOption } from "@/lib/agentModel";

type Agent = {
  id: string;
  name: string;
  emoji: string;
  modelTag: string;
  systemPrompt?: string;
  wikiDefault?: boolean;
  color?: string;
  scopeId?: string | null;
};
type BrainDoc = { id: string; title: string; sourceType: string; sourcePath: string };
type CustomNode = { id: string; label: string; color: string; emoji?: string; parentId?: string };

type Node = {
  id: string;
  kind: "hub" | "agent" | "folder" | "doc" | "custom";
  label: string;
  emoji?: string;
  color: string;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed?: boolean;
  pinned?: boolean;
  showLabel?: boolean;
  agent?: Agent;
};
type Edge = { a: string; b: string; len: number; linkId?: string };
type CustomLink = { id: string; a: string; b: string };
type Selected = { id: string; kind: string; label: string; color: string; emoji: string; parentId: string };
type GraphPrefs = { lineWidth: number; curved: boolean };

const PREFS_KEY = "nedory_graph_prefs";
function loadPrefs(): GraphPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    return { lineWidth: p.lineWidth ?? 1, curved: !!p.curved };
  } catch {
    return { lineWidth: 1, curved: false };
  }
}

const SOURCE_COLOR: Record<string, string> = {
  obsidian: "#a78bfa",
  library: "#9cdef2",
  upload: "#f0ad4e",
  manual: "#8a8d96",
  chat: "#e06c75",
};
const FOLDER_COLOR = "#7d7fe0";
const PALETTE = [
  "#e06c75", "#f0ad4e", "#58d68a", "#5aa0f0", "#a78bfa",
  "#4ecdc4", "#ff8c42", "#ec6cb0", "#8a8d96", "#e9e6e4",
];
const POS_KEY = "nedory_graph_positions";

type SavedPos = Record<string, { x: number; y: number }>;
function loadPositions(): SavedPos {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY) || "{}") as SavedPos;
  } catch {
    return {};
  }
}

export function GraphTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const rafRef = useRef<number>(0);
  const kickRef = useRef<() => void>(() => {});
  const selectedIdRef = useRef<string | null>(null);
  const dragRef = useRef<{ node: Node | null; moved: number }>({ node: null, moved: 0 });
  const optionsRef = useRef<ModelOption[]>([]);
  const editModeRef = useRef(false);

  const [hoverLabel, setHoverLabel] = useState<{ x: number; y: number; text: string } | null>(null);
  const [empty, setEmpty] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [customNodes, setCustomNodes] = useState<CustomNode[]>([]);
  const [links, setLinks] = useState<CustomLink[]>([]);
  const [prefs, setPrefs] = useState<GraphPrefs>({ lineWidth: 1, curved: false });
  const prefsRef = useRef<GraphPrefs>({ lineWidth: 1, curved: false });
  const [showLines, setShowLines] = useState(false);
  const [scopePrefix, setScopePrefix] = useState("");
  const [scopeBusy, setScopeBusy] = useState(false);
  const [scopeMsg, setScopeMsg] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);
  useEffect(() => {
    const t = setTimeout(() => {
      const p = loadPrefs();
      setPrefs(p);
      prefsRef.current = p;
    }, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    prefsRef.current = prefs;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // ignore
    }
    kickRef.current();
  }, [prefs]);
  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null;
    kickRef.current();
    const t = setTimeout(() => {
      setScopePrefix(selected?.label ?? "");
      setScopeMsg(null);
    }, 0);
    return () => clearTimeout(t);
  }, [selected]);

  const graphNode = (id: string) => nodesRef.current.find((n) => n.id === id);

  const launchAgent = useCallback(
    async (agent: Agent) => {
      const opt = resolveAgentOption(agent.modelTag, optionsRef.current);
      if (!opt) return;
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backend: "ollama",
          modelId: opt.id,
          title: `${agent.emoji} ${agent.name}`,
          systemPrompt: agent.systemPrompt || undefined,
          wikiEnabled: agent.wikiDefault ?? false,
          scopeId: agent.scopeId ?? undefined,
        }),
      });
      const data = await res.json();
      router.push(`/chat/${data.conversation.id}`);
    },
    [router],
  );

  const selectNode = useCallback((n: Node) => {
    setSelected({
      id: n.id,
      kind: n.kind,
      label: n.label,
      color: n.color,
      emoji: n.emoji ?? "",
      parentId: edgesRef.current.find((e) => e.b === n.id && !e.linkId)?.a ?? "hub",
    });
  }, []);

  const savePinned = useCallback(() => {
    const pos: SavedPos = {};
    for (const n of nodesRef.current) if (n.pinned) pos[n.id] = { x: Math.round(n.x), y: Math.round(n.y) };
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      // storage unavailable — arranging just won't persist
    }
  }, []);

  const resetLayout = useCallback(() => {
    try {
      localStorage.removeItem(POS_KEY);
    } catch {
      // ignore
    }
    const canvas = canvasRef.current;
    const cx = (canvas?.clientWidth ?? 800) / 2;
    const cy = (canvas?.clientHeight ?? 560) / 2;
    // Reassigns the whole array (new node objects) rather than mutating each
    // node in place — same pattern the layout-settle path below (nodesRef.current
    // = nodes) already uses for this ref.
    nodesRef.current = nodesRef.current.map((n) =>
      n.fixed
        ? n
        : { ...n, pinned: false, x: cx + (Math.random() - 0.5) * 320, y: cy + (Math.random() - 0.5) * 320, vx: 0, vy: 0 },
    );
    window.dispatchEvent(new Event("resize"));
  }, []);

  // --- graph editing ---
  const addNode = useCallback(async () => {
    const canvas = canvasRef.current;
    const cx = (canvas?.clientWidth ?? 800) / 2;
    const cy = (canvas?.clientHeight ?? 560) / 2;
    const color = PALETTE[Math.floor(Math.random() * 5)];
    const res = await fetch("/api/brain/nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "New node", color, parentId: "hub" }),
    });
    const { node } = (await res.json()) as { node: CustomNode };
    setCustomNodes((prev) => [...prev, node]);
    const gn: Node = {
      id: node.id, kind: "custom", label: node.label, color: node.color, emoji: node.emoji,
      r: 11, x: cx + (Math.random() - 0.5) * 80, y: cy + (Math.random() - 0.5) * 80,
      vx: 0, vy: 0, showLabel: true,
    };
    nodesRef.current.push(gn);
    edgesRef.current.push({ a: "hub", b: node.id, len: 120 });
    setEditMode(true);
    selectNode(gn);
    kickRef.current();
  }, [selectNode]);

  const patchCustom = useCallback(async (id: string, patch: Partial<CustomNode>) => {
    const gn = graphNode(id);
    if (gn) {
      if (patch.label !== undefined) gn.label = patch.label || "Node";
      if (patch.color !== undefined) gn.color = patch.color;
      if (patch.emoji !== undefined) gn.emoji = patch.emoji || undefined;
      if (patch.parentId !== undefined) {
        edgesRef.current = edgesRef.current.filter((e) => e.b !== id);
        edgesRef.current.push({ a: patch.parentId || "hub", b: id, len: 120 });
      }
      kickRef.current();
    }
    await fetch("/api/brain/nodes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }, []);

  const patchHub = useCallback(async (patch: { label?: string; emoji?: string; color?: string }) => {
    const gn = graphNode("hub");
    if (gn) {
      if (patch.label !== undefined) gn.label = patch.label || "brain";
      if (patch.emoji !== undefined) gn.emoji = patch.emoji;
      if (patch.color !== undefined) gn.color = patch.color;
      kickRef.current();
    }
    await fetch("/api/brain/hub", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }, []);

  const recolorAgent = useCallback(async (nodeId: string, color: string) => {
    const gn = graphNode(nodeId);
    if (gn) {
      gn.color = color;
      kickRef.current();
    }
    const agentId = nodeId.replace(/^agent:/, "");
    await fetch("/api/agents", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: agentId, color }),
    });
    setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, color } : a)));
  }, []);

  const removeCustom = useCallback(async (id: string) => {
    nodesRef.current = nodesRef.current.filter((n) => n.id !== id);
    edgesRef.current = edgesRef.current.filter((e) => e.a !== id && e.b !== id);
    setCustomNodes((prev) => prev.filter((n) => n.id !== id));
    setSelected(null);
    kickRef.current();
    await fetch("/api/brain/nodes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }, []);

  // Scope membership has no per-doc UI (checking hundreds of notes one at a
  // time isn't usable) — this adds every doc whose title/folder path matches
  // a keyword into the selected scope node in one call.
  const bulkAssignScope = useCallback(async (scopeId: string, pathPrefix: string) => {
    if (!pathPrefix.trim()) return;
    setScopeBusy(true);
    setScopeMsg(null);
    try {
      const res = await fetch("/api/brain/scopes/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeId, pathPrefix }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setScopeMsg(`Added ${data.matched} matching note(s) to this scope.`);
    } catch (err) {
      setScopeMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setScopeBusy(false);
    }
  }, []);

  // A custom scope node like "Books" is often a purely visual grouping —
  // author folders get manually connected under it, but its label never
  // appears in any real file path, so the keyword matcher above finds
  // nothing. This instead walks the graph's actual hierarchy edges (the
  // same ones drawn on screen) from the node down and collects every doc
  // connected under it, whatever the path/title says.
  const collectDescendantDocIds = useCallback((rootId: string): string[] => {
    const children = new Map<string, string[]>();
    for (const e of edgesRef.current) {
      if (e.linkId) continue; // cross-links, not hierarchy
      if (!children.has(e.a)) children.set(e.a, []);
      children.get(e.a)!.push(e.b);
    }
    const docIds: string[] = [];
    const seen = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const node = graphNode(cur);
      if (node?.kind === "doc") docIds.push(cur.slice(4)); // strip "doc:" prefix
      for (const child of children.get(cur) ?? []) stack.push(child);
    }
    return docIds;
  }, []);

  const addBranchToScope = useCallback(
    async (scopeId: string) => {
      const docIds = collectDescendantDocIds(scopeId);
      if (docIds.length === 0) {
        setScopeMsg("No notes are connected under this node in the graph yet.");
        return;
      }
      setScopeBusy(true);
      setScopeMsg(null);
      try {
        const res = await fetch("/api/brain/scopes/bulk-ids", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scopeId, docIds }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        setScopeMsg(`Added ${data.added} note(s) connected under this node.`);
      } catch (err) {
        setScopeMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setScopeBusy(false);
      }
    },
    [collectDescendantDocIds],
  );

  // Re-connect any node to a new parent. Custom nodes persist via their store;
  // docs/folders persist as a parent override.
  const setParent = useCallback(async (id: string, parentId: string, kind: string) => {
    edgesRef.current = edgesRef.current.filter((e) => !(e.b === id && !e.linkId));
    edgesRef.current.push({ a: parentId || "hub", b: id, len: 120 });
    kickRef.current();
    if (kind === "custom") {
      await fetch("/api/brain/nodes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, parentId }),
      });
    } else {
      await fetch("/api/brain/parents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: id, parentId }),
      });
    }
  }, []);

  const addLink = useCallback(async (a: string, b: string) => {
    const res = await fetch("/api/brain/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a, b }),
    });
    const d = await res.json();
    if (d.link) {
      edgesRef.current.push({ a, b, len: 120, linkId: d.link.id });
      setLinks((prev) => [...prev, d.link]);
      kickRef.current();
    }
  }, []);

  const removeLink = useCallback(async (id: string) => {
    edgesRef.current = edgesRef.current.filter((e) => e.linkId !== id);
    setLinks((prev) => prev.filter((l) => l.id !== id));
    kickRef.current();
    await fetch("/api/brain/links", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }, []);

  const applyEdit = (patch: Partial<Selected>) => {
    if (!selected) return;
    const next = { ...selected, ...patch };
    setSelected(next);
    if (patch.parentId !== undefined) void setParent(selected.id, patch.parentId, selected.kind);
    if (selected.kind === "custom") {
      const cp: Partial<CustomNode> = {};
      if (patch.label !== undefined) cp.label = patch.label;
      if (patch.color !== undefined) cp.color = patch.color;
      if (patch.emoji !== undefined) cp.emoji = patch.emoji;
      if (Object.keys(cp).length) void patchCustom(selected.id, cp);
    } else if (selected.kind === "hub") {
      void patchHub({ label: patch.label, emoji: patch.emoji, color: patch.color });
    } else if (selected.kind === "agent" && patch.color !== undefined) {
      void recolorAgent(selected.id, patch.color);
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/agents").then((r) => r.json()),
      fetch("/api/brain/documents").then((r) => r.json()),
      fetch("/api/models").then((r) => r.json()),
      fetch("/api/brain/nodes").then((r) => r.json()),
      fetch("/api/brain/links").then((r) => r.json()),
      fetch("/api/brain/hub").then((r) => r.json()),
      fetch("/api/brain/parents").then((r) => r.json()),
    ]).then(([agentsData, docsData, modelsData, customData, linksData, hubData, parentsData]) => {
      if (cancelled) return;
      const agentList: Agent[] = agentsData.agents ?? [];
      const docs: BrainDoc[] = docsData.documents ?? [];
      const custom: CustomNode[] = customData.nodes ?? [];
      const customLinks: CustomLink[] = linksData.links ?? [];
      const hub = hubData.hub ?? { label: "brain", emoji: "🧠", color: "#e06c75" };
      const overrides: Record<string, string> = parentsData.overrides ?? {};
      // Honour a user's chosen parent for a doc/folder over the auto-derived one.
      const parentFor = (id: string, dflt: string) => overrides[id] ?? dflt;
      optionsRef.current = modelsData.options ?? [];
      setAgents(agentList);
      setCustomNodes(custom);
      setLinks(customLinks);

      const canvas = canvasRef.current;
      const cx = (canvas?.clientWidth ?? 800) / 2;
      const cy = (canvas?.clientHeight ?? 560) / 2;
      const saved = loadPositions();

      const nodes: Node[] = [];
      const edges: Edge[] = [];
      const edgeSet = new Set<string>();
      const rand = (spread: number) => (Math.random() - 0.5) * spread;
      const addEdge = (a: string, b: string, len: number) => {
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (edgeSet.has(key)) return;
        edgeSet.add(key);
        edges.push({ a, b, len });
      };
      const place = (n: Node) => {
        const s = saved[n.id];
        if (s) {
          n.x = s.x;
          n.y = s.y;
          n.pinned = true;
        }
        nodes.push(n);
      };

      place({ id: "hub", kind: "hub", label: hub.label, emoji: hub.emoji, color: hub.color, r: 26, x: cx, y: cy, vx: 0, vy: 0, fixed: true, showLabel: true });

      for (const a of agentList) {
        place({ id: `agent:${a.id}`, kind: "agent", label: a.name, emoji: a.emoji, color: a.color ?? "#e06c75", r: 20, x: cx + rand(180), y: cy + rand(180), vx: 0, vy: 0, showLabel: true, agent: a });
        addEdge(parentFor(`agent:${a.id}`, "hub"), `agent:${a.id}`, 140);
      }

      const athena = agentList.find((a) => /scriptoria|athena/i.test(a.modelTag) || /athena/i.test(a.name));

      const vaultDocs = docs.filter((d) => d.sourceType === "obsidian" && d.sourcePath && !d.sourcePath.startsWith("chat:"));
      const splits = vaultDocs.map((d) => d.sourcePath.split("/").filter(Boolean));
      let cp = 0;
      if (splits.length) {
        const minLen = Math.min(...splits.map((s) => s.length));
        while (cp < minLen - 1 && splits.every((s) => s[cp] === splits[0][cp])) cp++;
      }
      const docByRel = new Map<string, string>();
      vaultDocs.forEach((d, i) => {
        const rel = splits[i].slice(cp).join("/").replace(/\.(md|markdown)$/i, "");
        docByRel.set(rel, `doc:${d.id}`);
      });
      const parents = new Set<string>();
      const folderId = new Map<string, string>();
      function ensureFolder(segs: string[]): string {
        if (segs.length === 0) return "hub";
        const key = segs.join("/");
        const existing = folderId.get(key);
        if (existing) return existing;
        const indexDoc = docByRel.get(key);
        const id = indexDoc ?? `folder:${key}`;
        if (!indexDoc) place({ id, kind: "folder", label: segs[segs.length - 1], color: FOLDER_COLOR, r: 9, x: cx + rand(260), y: cy + rand(260), vx: 0, vy: 0 });
        folderId.set(key, id);
        parents.add(id);
        addEdge(parentFor(id, ensureFolder(segs.slice(0, -1))), id, 90);
        return id;
      }

      const vaultIds = new Set(vaultDocs.map((d) => `doc:${d.id}`));
      vaultDocs.forEach((d, i) => {
        const id = `doc:${d.id}`;
        place({ id, kind: "doc", label: d.title, color: SOURCE_COLOR.obsidian, r: 5, x: cx + rand(320), y: cy + rand(320), vx: 0, vy: 0 });
        addEdge(parentFor(id, ensureFolder(splits[i].slice(cp).slice(0, -1))), id, 55);
      });

      // Library books whose title matches an existing author/book folder
      // (from the Obsidian hierarchy above) default into that same branch
      // instead of dangling off Athena — so "the note about Bondy's book"
      // and "the actual epub of that book" end up in one place.
      function findAuthorFolder(title: string): string | undefined {
        const lower = title.toLowerCase();
        for (const [key, folderNodeId] of folderId) {
          const leaf = key.split("/").pop() ?? key;
          if (leaf.length > 2 && lower.includes(leaf.toLowerCase())) return folderNodeId;
        }
        return undefined;
      }

      for (const d of docs) {
        const id = `doc:${d.id}`;
        if (vaultIds.has(id)) continue;
        place({ id, kind: "doc", label: d.title, color: SOURCE_COLOR[d.sourceType] ?? "#8a8d96", r: 5, x: cx + rand(300), y: cy + rand(300), vx: 0, vy: 0 });
        const matchedFolder = d.sourceType === "library" ? findAuthorFolder(d.title) : undefined;
        const dflt = matchedFolder ?? (d.sourceType === "library" && athena ? `agent:${athena.id}` : "hub");
        const parent = parentFor(id, dflt);
        addEdge(parent, id, parent === "hub" ? 110 : 70);
      }

      for (const c of custom) {
        place({ id: c.id, kind: "custom", label: c.label, color: c.color, emoji: c.emoji, r: 11, x: cx + rand(220), y: cy + rand(220), vx: 0, vy: 0, showLabel: true });
        addEdge(c.parentId || "hub", c.id, 120);
      }

      for (const l of customLinks) {
        edges.push({ a: l.a, b: l.b, len: 130, linkId: l.id });
      }

      for (const n of nodes) {
        if (parents.has(n.id)) {
          n.showLabel = true;
          if (n.kind === "doc") n.r = 8;
        }
      }

      nodesRef.current = nodes;
      edgesRef.current = edges;
      setEmpty(nodes.length <= 1);
      kickRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const anchored = (n: Node) => n.fixed || n.pinned;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      kick();
    }
    resize();
    window.addEventListener("resize", resize);

    function step() {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        if (anchored(a)) continue;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) {
            dx = Math.random();
            dy = Math.random();
            d2 = 1;
          }
          const d = Math.sqrt(d2);
          const force = (a.r + b.r + 900) / d2;
          const fx = (dx / d) * force;
          const fy = (dy / d) * force;
          a.vx += fx;
          a.vy += fy;
          if (!anchored(b)) {
            b.vx -= fx;
            b.vy -= fy;
          }
        }
      }
      const byId = new Map(nodes.map((n) => [n.id, n]));
      for (const e of edges) {
        const a = byId.get(e.a);
        const b = byId.get(e.b);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - e.len) * 0.02;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        if (!anchored(a)) {
          a.vx += fx;
          a.vy += fy;
        }
        if (!anchored(b)) {
          b.vx -= fx;
          b.vy -= fy;
        }
      }
      let energy = 0;
      for (const n of nodes) {
        if (n.fixed) {
          n.x = w / 2;
          n.y = h / 2;
          continue;
        }
        if (n.pinned) {
          n.vx = 0;
          n.vy = 0;
          continue;
        }
        n.vx += (w / 2 - n.x) * 0.0006;
        n.vy += (h / 2 - n.y) * 0.0006;
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(n.r, Math.min(w - n.r, n.x));
        n.y = Math.max(n.r, Math.min(h - n.r, n.y));
        energy += n.vx * n.vx + n.vy * n.vy;
      }

      ctx.clearRect(0, 0, w, h);
      const pf = prefsRef.current;
      for (const e of edges) {
        const a = byId.get(e.a);
        const b = byId.get(e.b);
        if (!a || !b) continue;
        // Custom links are drawn in the accent, a touch thicker, so hand-drawn
        // connections stand out from the auto-derived structure.
        ctx.lineWidth = e.linkId ? pf.lineWidth + 0.75 : pf.lineWidth;
        ctx.strokeStyle = e.linkId ? "rgba(224,108,117,0.55)" : `rgba(255,255,255,${0.05 + pf.lineWidth * 0.03})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        if (pf.curved) {
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          ctx.quadraticCurveTo(mx - dy * 0.12, my + dx * 0.12, b.x, b.y);
        } else {
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      }
      const selId = selectedIdRef.current;
      for (const n of nodes) {
        if (n.id === selId) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 5, 0, Math.PI * 2);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        if (n.kind === "doc" && !n.showLabel) {
          ctx.fillStyle = n.color;
          ctx.fill();
        } else if (n.kind === "doc" || n.kind === "folder" || n.kind === "custom") {
          ctx.fillStyle = n.color;
          ctx.fill();
          if (n.kind === "custom") {
            ctx.save();
            ctx.strokeStyle = "rgba(255,255,255,0.7)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
          }
          if (n.emoji) {
            ctx.font = `${n.r}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(n.emoji, n.x, n.y + 1);
          }
          ctx.fillStyle = "#c9c6c4";
          ctx.font = "10px ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(n.label, n.x, n.y + n.r + 9);
        } else {
          ctx.fillStyle = "#131417";
          ctx.fill();
          ctx.save();
          ctx.strokeStyle = n.color;
          ctx.lineWidth = n.kind === "agent" ? 3 : 2;
          ctx.shadowColor = n.color;
          ctx.shadowBlur = n.kind === "agent" ? 10 : 0;
          ctx.stroke();
          ctx.restore();
          ctx.font = `${n.r + 4}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(n.emoji ?? "", n.x, n.y + 1);
          ctx.fillStyle = "#e9e6e4";
          ctx.font = "11px ui-monospace, monospace";
          ctx.fillText(n.label, n.x, n.y + n.r + 11);
        }
      }

      if (energy > 0.05 || dragRef.current.node) rafRef.current = requestAnimationFrame(step);
      else rafRef.current = 0;
    }

    function kick() {
      if (!rafRef.current) rafRef.current = requestAnimationFrame(step);
    }
    kickRef.current = kick;
    const interval = setInterval(kick, 400);

    function nodeAt(px: number, py: number): Node | null {
      const nodes = nodesRef.current;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const hit = Math.max(n.r, 10);
        if ((px - n.x) ** 2 + (py - n.y) ** 2 <= hit * hit) return n;
      }
      return null;
    }
    function pos(e: PointerEvent | MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function onDown(e: PointerEvent) {
      const { x, y } = pos(e);
      const n = nodeAt(x, y);
      if (n && !n.fixed) {
        dragRef.current = { node: n, moved: 0 };
        canvas!.setPointerCapture(e.pointerId);
        kick();
      }
    }
    function onMove(e: PointerEvent) {
      const { x, y } = pos(e);
      const drag = dragRef.current;
      if (drag.node) {
        drag.moved += Math.abs(drag.node.x - x) + Math.abs(drag.node.y - y);
        drag.node.x = x;
        drag.node.y = y;
        drag.node.vx = 0;
        drag.node.vy = 0;
        kick();
      } else {
        const n = nodeAt(x, y);
        setHoverLabel(n && n.kind === "doc" && !n.showLabel ? { x, y, text: n.label } : null);
        canvas!.style.cursor = n ? "pointer" : "default";
      }
    }
    function onUp() {
      const drag = dragRef.current;
      if (drag.node) {
        if (drag.moved < 5) {
          // A tap: in edit mode select for editing; otherwise agents launch a chat.
          if (editModeRef.current) selectNode(drag.node);
          else if (drag.node.kind === "agent" && drag.node.agent) launchAgent(drag.node.agent);
        } else {
          drag.node.pinned = true;
          savePinned();
        }
      }
      dragRef.current = { node: null, moved: 0 };
    }
    function onDouble(e: MouseEvent) {
      const { x, y } = pos(e);
      const n = nodeAt(x, y);
      if (n && n.pinned) {
        n.pinned = false;
        savePinned();
        kick();
      }
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("dblclick", onDouble);

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("dblclick", onDouble);
      clearInterval(interval);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [launchAgent, savePinned, selectNode]);

  const parentOptions = [
    { id: "hub", label: "🧠 brain" },
    ...agents.map((a) => ({ id: `agent:${a.id}`, label: `${a.emoji} ${a.name}` })),
    ...customNodes.map((c) => ({ id: c.id, label: `${c.emoji ?? "●"} ${c.label}` })),
  ];
  const selectedLinks = selected ? links.filter((l) => l.a === selected.id || l.b === selected.id) : [];
  const linkedIds = new Set(selectedLinks.map((l) => (l.a === selected?.id ? l.b : l.a)));
  const labelOf = (id: string) => parentOptions.find((o) => o.id === id)?.label ?? "a note";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink-dim">
          Your knowledge mesh. <span className="text-accent">◢</span> agents are the big nodes.
          Folders group your notes (author → books). Drag to pin, double-tap to release.
          {editMode ? " Edit mode: tap a node to recolor or rename it." : " Tap an agent to chat."}
        </p>
        <div className="flex shrink-0 gap-2">
          <button onClick={addNode} className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs text-ink-dim hover:text-ink" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            <Plus size={12} /> Node
          </button>
          <button onClick={() => { setEditMode((v) => !v); if (editMode) setSelected(null); }} className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs ${editMode ? "text-accent border-accent" : "text-ink-dim hover:text-ink"}`} style={{ borderColor: editMode ? undefined : "var(--border)", background: "var(--surface-2)" }}>
            <Pencil size={12} /> Edit
          </button>
          <div className="relative">
            <button onClick={() => setShowLines((v) => !v)} className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs text-ink-dim hover:text-ink" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <Spline size={12} /> Lines
            </button>
            {showLines && (
              <div className="absolute right-0 top-8 z-10 w-52 rounded-md border p-3 flex flex-col gap-2.5 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <label className="flex flex-col gap-1 text-ink-dim">
                  <span>Line width — {prefs.lineWidth.toFixed(1)}px</span>
                  <input type="range" min={0.5} max={4} step={0.5} value={prefs.lineWidth} onChange={(e) => setPrefs((p) => ({ ...p, lineWidth: Number(e.target.value) }))} />
                </label>
                <label className="flex items-center gap-2 text-ink-dim">
                  <input type="checkbox" checked={prefs.curved} onChange={(e) => setPrefs((p) => ({ ...p, curved: e.target.checked }))} />
                  Curved connections
                </label>
              </div>
            )}
          </div>
          <button onClick={resetLayout} className="rounded-md border px-2.5 py-1 text-xs text-ink-dim hover:text-ink" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            Reset
          </button>
        </div>
      </div>

      <div className="relative rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <canvas ref={canvasRef} className="w-full" style={{ height: "560px", touchAction: "none" }} />
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-dim">
            Nothing to graph yet — add notes/agents first.
          </div>
        )}
        {hoverLabel && (
          <div className="absolute pointer-events-none rounded border px-2 py-0.5 text-xs bg-[var(--surface-2)] text-ink" style={{ left: hoverLabel.x + 8, top: hoverLabel.y + 8, borderColor: "var(--border)" }}>
            {hoverLabel.text}
          </div>
        )}
        <div className="absolute bottom-2 right-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-dim justify-end">
          <span><span style={{ color: FOLDER_COLOR }}>●</span> folder</span>
          <span><span style={{ color: SOURCE_COLOR.obsidian }}>●</span> note</span>
          <span><span style={{ color: SOURCE_COLOR.library }}>●</span> book</span>
          <span><span style={{ color: SOURCE_COLOR.chat }}>●</span> chat</span>
        </div>
      </div>

      {selected && (
        <div className="rounded-lg border p-3 flex flex-col gap-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-ink-dim">
              Editing {selected.kind === "agent" ? "agent" : "node"}
            </span>
            <button onClick={() => setSelected(null)} className="text-xs text-ink-dim hover:text-ink">
              done
            </button>
          </div>

          {(selected.kind === "custom" || selected.kind === "hub") && (
            <div className="flex gap-2">
              <input
                className="w-14 rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1.5 text-sm text-ink text-center focus:outline-none focus:border-accent"
                value={selected.emoji}
                onChange={(e) => applyEdit({ emoji: e.target.value })}
                placeholder="●"
                maxLength={4}
              />
              <input
                className="flex-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent"
                value={selected.label}
                onChange={(e) => applyEdit({ label: e.target.value })}
                placeholder="Label"
              />
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-ink-dim">Color</span>
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => applyEdit({ color: c })}
                className="w-6 h-6 rounded-full border-2"
                style={{ background: c, borderColor: selected.color === c ? "#fff" : "transparent" }}
                aria-label={`color ${c}`}
              />
            ))}
            <input type="color" value={selected.color} onChange={(e) => applyEdit({ color: e.target.value })} className="w-6 h-6 rounded bg-transparent border-0 p-0" />
          </div>

          {selected.kind !== "hub" && (
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-ink-dim">
                Connects to
                <select
                  className="rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent"
                  value={selected.parentId}
                  onChange={(e) => applyEdit({ parentId: e.target.value })}
                >
                  {parentOptions
                    .filter((o) => o.id !== selected.id)
                    .map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                </select>
              </label>
              {selected.kind === "custom" && (
                <button onClick={() => removeCustom(selected.id)} className="flex items-center gap-1 text-xs text-ink-dim hover:text-accent">
                  <Trash2 size={13} /> delete
                </button>
              )}
            </div>
          )}

          {selected.kind === "custom" && (
            <div className="flex flex-col gap-1.5 border-t pt-2" style={{ borderColor: "var(--border)" }}>
              <span className="text-xs text-ink-dim">
                Scope membership — no notes are searched when a chat is pinned to this node until
                you add them here.
              </span>
              <button
                onClick={() => addBranchToScope(selected.id)}
                disabled={scopeBusy}
                className="rounded-md border px-2.5 py-1.5 text-xs text-ink-dim hover:text-ink"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              >
                {scopeBusy ? "adding…" : "add everything connected to this node"}
              </button>
              <div className="flex items-center gap-2 text-xs text-ink-dim">
                <span className="flex-1 h-px" style={{ background: "var(--border)" }} />
                or match by keyword
                <span className="flex-1 h-px" style={{ background: "var(--border)" }} />
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent"
                  value={scopePrefix}
                  onChange={(e) => setScopePrefix(e.target.value)}
                  placeholder="Folder or author name, e.g. Bondy"
                />
                <button
                  onClick={() => bulkAssignScope(selected.id, scopePrefix)}
                  disabled={scopeBusy || !scopePrefix.trim()}
                  className="rounded-md border px-2.5 py-1 text-xs text-ink-dim hover:text-ink whitespace-nowrap"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                >
                  {scopeBusy ? "adding…" : "add matches"}
                </button>
              </div>
              {scopeMsg && <span className="text-xs text-ink-dim">{scopeMsg}</span>}
            </div>
          )}

          <div className="flex flex-col gap-1.5 border-t pt-2" style={{ borderColor: "var(--border)" }}>
            <span className="text-xs text-ink-dim flex items-center gap-1"><Link2 size={12} /> Connections</span>
            {selectedLinks.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedLinks.map((l) => {
                  const other = l.a === selected.id ? l.b : l.a;
                  return (
                    <span key={l.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-ink-dim" style={{ borderColor: "var(--border)" }}>
                      {labelOf(other)}
                      <button onClick={() => removeLink(l.id)} className="hover:text-accent" aria-label="Remove connection">
                        <Unlink size={11} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <select
              className="rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent"
              value=""
              onChange={(e) => {
                if (e.target.value) void addLink(selected.id, e.target.value);
              }}
            >
              <option value="">＋ connect to…</option>
              {parentOptions
                .filter((o) => o.id !== selected.id && !linkedIds.has(o.id))
                .map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
            </select>
          </div>

          {selected.kind === "agent" && (
            <p className="text-xs text-ink-dim">Rename or change this agent&apos;s model in the Agents tab.</p>
          )}
        </div>
      )}
    </div>
  );
}
