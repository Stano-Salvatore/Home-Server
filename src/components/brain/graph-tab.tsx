"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ModelOption } from "@/lib/types";

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

type Node = {
  id: string;
  kind: "hub" | "agent" | "folder" | "doc";
  label: string;
  emoji?: string;
  color: string;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed?: boolean; // hub only — recentres to the middle
  pinned?: boolean; // dragged into place by the user — stays put
  showLabel?: boolean;
  agent?: Agent;
};
type Edge = { a: string; b: string; len: number };

const SOURCE_COLOR: Record<string, string> = {
  obsidian: "#a78bfa",
  library: "#9cdef2",
  upload: "#f0ad4e",
  manual: "#8a8d96",
  chat: "#e06c75",
};
const FOLDER_COLOR = "#7d7fe0";
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
  const dragRef = useRef<{ node: Node | null; moved: number }>({ node: null, moved: 0 });
  const optionsRef = useRef<ModelOption[]>([]);
  const [hoverLabel, setHoverLabel] = useState<{ x: number; y: number; text: string } | null>(null);
  const [empty, setEmpty] = useState(false);
  const router = useRouter();

  const savePinned = useCallback(() => {
    const pos: SavedPos = {};
    for (const n of nodesRef.current) {
      if (n.pinned) pos[n.id] = { x: Math.round(n.x), y: Math.round(n.y) };
    }
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      // storage may be unavailable; arranging just won't persist
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
    // The resize handler restarts the simulation loop.
    window.dispatchEvent(new Event("resize"));
  }, []);

  const launchAgent = useCallback(
    async (agent: Agent) => {
      const opt = optionsRef.current.find((o) => o.backend === "ollama" && o.label === agent.modelTag);
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

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/agents").then((r) => r.json()),
      fetch("/api/brain/documents").then((r) => r.json()),
      fetch("/api/models").then((r) => r.json()),
    ]).then(([agentsData, docsData, modelsData]) => {
      if (cancelled) return;
      const agents: Agent[] = agentsData.agents ?? [];
      const docs: BrainDoc[] = docsData.documents ?? [];
      optionsRef.current = modelsData.options ?? [];

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

      place({
        id: "hub", kind: "hub", label: "brain", emoji: "🧠", color: "#e06c75",
        r: 26, x: cx, y: cy, vx: 0, vy: 0, fixed: true, showLabel: true,
      });

      for (const a of agents) {
        place({
          id: `agent:${a.id}`, kind: "agent", label: a.name, emoji: a.emoji,
          color: a.color ?? "#e06c75", r: 20, x: cx + rand(180), y: cy + rand(180),
          vx: 0, vy: 0, showLabel: true, agent: a,
        });
        addEdge("hub", `agent:${a.id}`, 140);
      }

      const athena = agents.find(
        (a) => /scriptoria|athena/i.test(a.modelTag) || /athena/i.test(a.name),
      );

      // --- Obsidian vault: build a folder tree from the file paths, so an
      // author folder becomes the parent of its book notes (and a Notion-style
      // index page — Tolkien.md next to Tolkien/… — becomes that parent node). ---
      const vaultDocs = docs.filter(
        (d) => d.sourceType === "obsidian" && d.sourcePath && !d.sourcePath.startsWith("chat:"),
      );
      const splits = vaultDocs.map((d) => d.sourcePath.split("/").filter(Boolean));
      let cp = 0;
      if (splits.length) {
        const minLen = Math.min(...splits.map((s) => s.length));
        while (cp < minLen - 1 && splits.every((s) => s[cp] === splits[0][cp])) cp++;
      }
      // rel path (no extension) -> doc node id, to detect index pages.
      const docByRel = new Map<string, string>();
      vaultDocs.forEach((d, i) => {
        const rel = splits[i].slice(cp).join("/").replace(/\.(md|markdown)$/i, "");
        docByRel.set(rel, `doc:${d.id}`);
      });
      const parents = new Set<string>(); // node ids that have children -> label them
      const folderId = new Map<string, string>();
      function ensureFolder(segs: string[]): string {
        if (segs.length === 0) return "hub";
        const key = segs.join("/");
        const existing = folderId.get(key);
        if (existing) return existing;
        const indexDoc = docByRel.get(key);
        const id = indexDoc ?? `folder:${key}`;
        if (!indexDoc) {
          place({
            id, kind: "folder", label: segs[segs.length - 1], color: FOLDER_COLOR,
            r: 9, x: cx + rand(260), y: cy + rand(260), vx: 0, vy: 0,
          });
        }
        folderId.set(key, id);
        parents.add(id);
        addEdge(ensureFolder(segs.slice(0, -1)), id, 90);
        return id;
      }

      const vaultIds = new Set(vaultDocs.map((d) => `doc:${d.id}`));
      vaultDocs.forEach((d, i) => {
        const rel = splits[i].slice(cp);
        const id = `doc:${d.id}`;
        place({
          id, kind: "doc", label: d.title, color: SOURCE_COLOR.obsidian,
          r: 5, x: cx + rand(320), y: cy + rand(320), vx: 0, vy: 0,
        });
        addEdge(ensureFolder(rel.slice(0, -1)), id, 55);
      });

      // --- Everything else: chat/library/upload/manual keep the simple layout. ---
      for (const d of docs) {
        const id = `doc:${d.id}`;
        if (vaultIds.has(id)) continue;
        place({
          id, kind: "doc", label: d.title, color: SOURCE_COLOR[d.sourceType] ?? "#8a8d96",
          r: 5, x: cx + rand(300), y: cy + rand(300), vx: 0, vy: 0,
        });
        const parent = d.sourceType === "library" && athena ? `agent:${athena.id}` : "hub";
        addEdge(parent, id, parent === "hub" ? 110 : 70);
      }

      // Parent docs (index pages / folders with children) get a permanent label
      // and a slightly larger dot so the hierarchy reads at a glance.
      for (const n of nodes) {
        if (parents.has(n.id)) {
          n.showLabel = true;
          if (n.kind === "doc") n.r = 8;
        }
      }

      nodesRef.current = nodes;
      edgesRef.current = edges;
      setEmpty(nodes.length <= 1);
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
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        if (n.kind === "doc" && !n.showLabel) {
          ctx.fillStyle = n.color;
          ctx.fill();
        } else if (n.kind === "doc" || n.kind === "folder") {
          // parent-ish node: filled dot + a ring + a permanent label
          ctx.fillStyle = n.color;
          ctx.fill();
          if (n.pinned) {
            ctx.save();
            ctx.strokeStyle = "rgba(255,255,255,0.55)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
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

      if (energy > 0.05 || dragRef.current.node) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = 0;
      }
    }

    function kick() {
      if (!rafRef.current) rafRef.current = requestAnimationFrame(step);
    }

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
        if (drag.moved < 5 && drag.node.kind === "agent" && drag.node.agent) {
          launchAgent(drag.node.agent);
        } else if (drag.moved >= 5) {
          // A deliberate drag pins the node where you put it, and remembers it.
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
  }, [launchAgent, savePinned]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink-dim">
          Your knowledge mesh. <span className="text-accent">◢</span> agents are the big nodes — tap
          one to chat. Folders group your notes (author → books); drag a node to pin it where you
          want, double-tap to release.
        </p>
        <button
          onClick={resetLayout}
          className="shrink-0 rounded-md border px-2.5 py-1 text-xs text-ink-dim hover:text-ink"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        >
          Reset layout
        </button>
      </div>
      <div className="relative rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <canvas ref={canvasRef} className="w-full" style={{ height: "560px", touchAction: "none" }} />
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-dim">
            Nothing to graph yet — add notes/agents first.
          </div>
        )}
        {hoverLabel && (
          <div
            className="absolute pointer-events-none rounded border px-2 py-0.5 text-xs bg-[var(--surface-2)] text-ink"
            style={{ left: hoverLabel.x + 8, top: hoverLabel.y + 8, borderColor: "var(--border)" }}
          >
            {hoverLabel.text}
          </div>
        )}
        <div className="absolute bottom-2 right-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-dim justify-end">
          <span><span style={{ color: FOLDER_COLOR }}>●</span> folder</span>
          <span><span style={{ color: SOURCE_COLOR.obsidian }}>●</span> note</span>
          <span><span style={{ color: SOURCE_COLOR.library }}>●</span> book</span>
          <span><span style={{ color: SOURCE_COLOR.upload }}>●</span> upload</span>
          <span><span style={{ color: SOURCE_COLOR.chat }}>●</span> chat</span>
        </div>
      </div>
    </div>
  );
}
