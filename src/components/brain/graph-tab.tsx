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
type BrainDoc = { id: string; title: string; sourceType: string };

type Node = {
  id: string;
  kind: "hub" | "agent" | "doc";
  label: string;
  emoji?: string;
  color: string;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed?: boolean;
  agent?: Agent;
};
type Edge = { a: string; b: string; len: number };

const SOURCE_COLOR: Record<string, string> = {
  obsidian: "#a78bfa",
  library: "#9cdef2",
  upload: "#f0ad4e",
  manual: "#8a8d96",
};

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

      const nodes: Node[] = [];
      const edges: Edge[] = [];
      const rand = (spread: number) => (Math.random() - 0.5) * spread;

      nodes.push({
        id: "hub",
        kind: "hub",
        label: "brain",
        emoji: "🧠",
        color: "#e06c75",
        r: 26,
        x: cx,
        y: cy,
        vx: 0,
        vy: 0,
        fixed: true,
      });

      for (const a of agents) {
        nodes.push({
          id: `agent:${a.id}`,
          kind: "agent",
          label: a.name,
          emoji: a.emoji,
          color: a.color ?? "#e06c75",
          r: 20,
          x: cx + rand(180),
          y: cy + rand(180),
          vx: 0,
          vy: 0,
          agent: a,
        });
        edges.push({ a: "hub", b: `agent:${a.id}`, len: 130 });
      }

      const athena = agents.find(
        (a) => /scriptoria|athena/i.test(a.modelTag) || /athena/i.test(a.name),
      );

      for (const d of docs) {
        const id = `doc:${d.id}`;
        nodes.push({
          id,
          kind: "doc",
          label: d.title,
          color: SOURCE_COLOR[d.sourceType] ?? "#8a8d96",
          r: 5,
          x: cx + rand(300),
          y: cy + rand(300),
          vx: 0,
          vy: 0,
        });
        // Library docs cluster around Athena; everything else around the hub.
        const parent = d.sourceType === "library" && athena ? `agent:${athena.id}` : "hub";
        edges.push({ a: parent, b: id, len: parent === "hub" ? 100 : 70 });
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

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    function step() {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;

      // Repulsion (O(n^2), fine for a personal-scale graph).
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        if (a.fixed) continue;
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
          if (!b.fixed) {
            b.vx -= fx;
            b.vy -= fy;
          }
        }
      }
      // Springs.
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
        if (!a.fixed) {
          a.vx += fx;
          a.vy += fy;
        }
        if (!b.fixed) {
          b.vx -= fx;
          b.vy -= fy;
        }
      }
      // Integrate + gentle centering + damping + bounds.
      let energy = 0;
      for (const n of nodes) {
        if (n.fixed) {
          n.x = w / 2;
          n.y = h / 2;
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

      // Draw.
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
        if (n.kind === "doc") {
          ctx.fillStyle = n.color;
          ctx.fill();
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

      // Keep animating while there's meaningful motion; idle otherwise.
      if (energy > 0.05 || dragRef.current.node) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = 0;
      }
    }

    function kick() {
      if (!rafRef.current) rafRef.current = requestAnimationFrame(step);
    }

    // Run for a bit initially and whenever data arrives.
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
    function pos(e: PointerEvent) {
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
        setHoverLabel(n && n.kind === "doc" ? { x, y, text: n.label } : null);
        canvas!.style.cursor = n ? "pointer" : "default";
      }
    }
    function onUp() {
      const drag = dragRef.current;
      if (drag.node && drag.moved < 5 && drag.node.kind === "agent" && drag.node.agent) {
        launchAgent(drag.node.agent);
      }
      dragRef.current = { node: null, moved: 0 };
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      clearInterval(interval);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [launchAgent]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-dim">
        Your knowledge mesh. <span className="text-accent">◢</span> agents are the big nodes — tap
        one to chat. Dots are indexed documents, colored by source. Drag to rearrange.
      </p>
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
        <div className="absolute bottom-2 right-3 flex gap-3 text-[10px] text-ink-dim">
          <span><span style={{ color: SOURCE_COLOR.obsidian }}>●</span> obsidian</span>
          <span><span style={{ color: SOURCE_COLOR.library }}>●</span> library</span>
          <span><span style={{ color: SOURCE_COLOR.upload }}>●</span> upload</span>
          <span><span style={{ color: SOURCE_COLOR.manual }}>●</span> manual</span>
        </div>
      </div>
    </div>
  );
}
