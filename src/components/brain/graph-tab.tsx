"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
type Edge = { a: string; b: string; len: number };
type Selected = { id: string; kind: string; label: string; color: string; emoji: string; parentId: string };

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
  const router = useRouter();

  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);
  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null;
    kickRef.current();
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
        }),
      });
      const data = await res.json();
      router.push(`/chat/${data.conversation.id}`);
    },
    [router],
  );

  const selectNode = useCallback((n: Node) => {
    if (n.kind !== "agent" && n.kind !== "custom") return;
    setSelected({
      id: n.id,
      kind: n.kind,
      label: n.label,
      color: n.color,
      emoji: n.emoji ?? "",
      parentId: edgesRef.current.find((e) => e.b === n.id)?.a ?? "hub",
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
    for (const n of nodesRef.current) {
      if (n.fixed) continue;
      n.pinned = false;
      n.x = cx + (Math.random() - 0.5) * 320;
      n.y = cy + (Math.random() - 0.5) * 320;
      n.vx = 0;
      n.vy = 0;
    }
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

  const applyEdit = (patch: Partial<Selected>) => {
    if (!selected) return;
    const next = { ...selected, ...patch };
    setSelected(next);
    if (selected.kind === "custom") {
      const cp: Partial<CustomNode> = {};
      if (patch.label !== undefined) cp.label = patch.label;
      if (patch.color !== undefined) cp.color = patch.color;
      if (patch.emoji !== undefined) cp.emoji = patch.emoji;
      if (patch.parentId !== undefined) cp.parentId = patch.parentId;
      void patchCustom(selected.id, cp);
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
    ]).then(([agentsData, docsData, modelsData, customData]) => {
      if (cancelled) return;
      const agentList: Agent[] = agentsData.agents ?? [];
      const docs: BrainDoc[] = docsData.documents ?? [];
      const custom: CustomNode[] = customData.nodes ?? [];
      optionsRef.current = modelsData.options ?? [];
      setAgents(agentList);
      setCustomNodes(custom);

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

      place({ id: "hub", kind: "hub", label: "brain", emoji: "🧠", color: "#e06c75", r: 26, x: cx, y: cy, vx: 0, vy: 0, fixed: true, showLabel: true });

      for (const a of agentList) {
        place({ id: `agent:${a.id}`, kind: "agent", label: a.name, emoji: a.emoji, color: a.color ?? "#e06c75", r: 20, x: cx + rand(180), y: cy + rand(180), vx: 0, vy: 0, showLabel: true, agent: a });
        addEdge("hub", `agent:${a.id}`, 140);
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
        addEdge(ensureFolder(segs.slice(0, -1)), id, 90);
        return id;
      }

      const vaultIds = new Set(vaultDocs.map((d) => `doc:${d.id}`));
      vaultDocs.forEach((d, i) => {
        const id = `doc:${d.id}`;
        place({ id, kind: "doc", label: d.title, color: SOURCE_COLOR.obsidian, r: 5, x: cx + rand(320), y: cy + rand(320), vx: 0, vy: 0 });
        addEdge(ensureFolder(splits[i].slice(cp).slice(0, -1)), id, 55);
      });

      for (const d of docs) {
        const id = `doc:${d.id}`;
        if (vaultIds.has(id)) continue;
        place({ id, kind: "doc", label: d.title, color: SOURCE_COLOR[d.sourceType] ?? "#8a8d96", r: 5, x: cx + rand(300), y: cy + rand(300), vx: 0, vy: 0 });
        const parent = d.sourceType === "library" && athena ? `agent:${athena.id}` : "hub";
        addEdge(parent, id, parent === "hub" ? 110 : 70);
      }

      for (const c of custom) {
        place({ id: c.id, kind: "custom", label: c.label, color: c.color, emoji: c.emoji, r: 11, x: cx + rand(220), y: cy + rand(220), vx: 0, vy: 0, showLabel: true });
        addEdge(c.parentId || "hub", c.id, 120);
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
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      for (const e of edges) {
        const a = byId.get(e.a);
        const b = byId.get(e.b);
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
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

          {selected.kind === "custom" && (
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

          {selected.kind === "custom" && (
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
              <button onClick={() => removeCustom(selected.id)} className="flex items-center gap-1 text-xs text-ink-dim hover:text-accent">
                <Trash2 size={13} /> delete
              </button>
            </div>
          )}

          {selected.kind === "agent" && (
            <p className="text-xs text-ink-dim">Rename or change this agent&apos;s model in the Agents tab.</p>
          )}
        </div>
      )}
    </div>
  );
}
