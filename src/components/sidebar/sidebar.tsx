"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebarCollapsed } from "@/lib/useSidebarCollapsed";
import {
  MessageSquare,
  Bot,
  Users,
  BrainCircuit,
  ChefHat,
  Library,
  ListChecks,
  FolderOpenDot,
  FolderKanban,
  Server,
  Settings,
  Menu,
  X,
} from "lucide-react";

// Grouped like Odysseus's rail: thin separators between clusters of
// related tools instead of one long flat list.
const NAV_GROUPS = [
  [
    { href: "/chat", label: "chat", icon: MessageSquare },
    { href: "/projects", label: "projects", icon: FolderKanban },
    { href: "/agents", label: "agents", icon: Bot },
    { href: "/council", label: "council", icon: Users },
  ],
  [
    { href: "/brain", label: "brain", icon: BrainCircuit },
    { href: "/cookbook", label: "cookbook", icon: ChefHat },
    { href: "/nodes", label: "nodes", icon: Server },
    { href: "/library", label: "bibliotheca", icon: Library },
  ],
  [
    { href: "/tasks", label: "tasks", icon: ListChecks },
    { href: "/files", label: "files", icon: FolderOpenDot },
    { href: "/settings", label: "settings", icon: Settings },
  ],
];

type Health = { online: number; total: number; services: number; servicesOnline: number };

function useHealth(): Health | null {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    let alive = true;
    const poll = () =>
      fetch("/api/nodes")
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          const nodes = d.nodes ?? [];
          const services = d.services ?? [];
          setHealth({
            online: nodes.filter((n: { online: boolean }) => n.online).length,
            total: nodes.length,
            services: services.length,
            servicesOnline: services.filter((s: { online: boolean }) => s.online).length,
          });
        })
        .catch(() => {});
    poll();
    const id = setInterval(poll, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return health;
}

function StatusRow() {
  const health = useHealth();
  if (!health) return null;
  const allUp = health.total > 0 && health.online === health.total;
  const someUp = health.online > 0;
  const color = allUp ? "var(--color-term-green)" : someUp ? "var(--color-term-gold)" : "var(--accent)";
  const label = health.total === 0 ? "no nodes" : `${health.online}/${health.total} nodes up`;
  return (
    <div className="mt-auto px-2 pt-3 flex items-center gap-2 text-[11px] text-ink-dim border-t" style={{ borderColor: "var(--border)" }}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span>{label}</span>
      {health.services > 0 && (
        <span className="ml-auto text-ink-dim opacity-70" title="Kiwix / Qdrant services online">
          {health.servicesOnline}/{health.services} svc
        </span>
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Desktop-only: the rail slides away entirely, Odysseus-style, leaving a
  // floating hamburger to bring it back. Mobile keeps the off-canvas drawer.
  // Shared with the chat conversation list so both clear together.
  const [collapsed, setCollapsedPersistent] = useSidebarCollapsed();

  return (
    <>
      {/* Mobile top bar with a menu button — the rail is off-canvas on phones. */}
      <div
        className="md:hidden fixed top-0 inset-x-0 h-12 z-40 flex items-center gap-2 px-3 border-b"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="p-1 text-ink">
          <Menu size={20} />
        </button>
        <span className="text-[15px] font-semibold tracking-tight text-accent flex items-center gap-1.5">
          <span aria-hidden>◢</span> Nedory
        </span>
      </div>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Floating reopen button once the desktop rail has slid away. */}
      {collapsed && (
        <button
          onClick={() => setCollapsedPersistent(false)}
          aria-label="Open sidebar"
          className="hidden md:flex fixed top-3 left-3 z-30 p-1.5 rounded-md border text-ink-dim hover:text-ink"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <Menu size={18} />
        </button>
      )}

      <nav
        // left-0 must not reach desktop: `sticky left-0` horizontally re-pins
        // the rail to the viewport edge, cancelling the -ml-56 slide-away.
        className={`w-56 shrink-0 h-screen border-r flex flex-col py-4 px-3 z-50 fixed md:sticky top-0 left-0 md:left-auto transition-all duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 ${collapsed ? "md:-ml-56" : "md:ml-0"}`}
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="px-2 mb-6 flex items-start justify-between">
          <div className="flex items-start gap-2.5">
            <button
              onClick={() => setCollapsedPersistent(true)}
              aria-label="Collapse sidebar"
              className="hidden md:block p-0.5 mt-0.5 text-ink-dim hover:text-ink"
            >
              <Menu size={17} />
            </button>
            <div>
              <div className="text-[15px] font-semibold tracking-tight text-accent flex items-center gap-1.5">
                <span aria-hidden>◢</span> Nedory
              </div>
              <div className="text-[11px] text-ink-dim mt-0.5">
                <span className="text-accent">~</span> yours, fully local
              </div>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="md:hidden p-1 text-ink-dim hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col overflow-y-auto">
          {NAV_GROUPS.map((group, gi) => (
            <ul
              key={gi}
              className={`flex flex-col gap-0.5 ${gi > 0 ? "mt-2 pt-2 border-t" : ""}`}
              style={gi > 0 ? { borderColor: "var(--border)" } : undefined}
            >
              {group.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      className={`group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                        active ? "text-accent" : "text-ink-dim hover:text-ink"
                      }`}
                      style={active ? { background: "rgba(224, 108, 117, 0.10)" } : undefined}
                    >
                      <Icon
                        size={15}
                        strokeWidth={2}
                        className={active ? "text-accent" : "text-ink-dim group-hover:text-ink"}
                      />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ))}
        </div>
        <StatusRow />
      </nav>
    </>
  );
}
