"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

const NAV_ITEMS = [
  { href: "/chat", label: "chat", icon: MessageSquare },
  { href: "/projects", label: "projects", icon: FolderKanban },
  { href: "/agents", label: "agents", icon: Bot },
  { href: "/council", label: "council", icon: Users },
  { href: "/brain", label: "brain", icon: BrainCircuit },
  { href: "/cookbook", label: "cookbook", icon: ChefHat },
  { href: "/nodes", label: "nodes", icon: Server },
  { href: "/library", label: "bibliotheca", icon: Library },
  { href: "/tasks", label: "tasks", icon: ListChecks },
  { href: "/files", label: "files", icon: FolderOpenDot },
  { href: "/settings", label: "settings", icon: Settings },
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

      <nav
        className={`w-56 shrink-0 h-screen border-r flex flex-col py-4 px-3 z-50 fixed md:sticky top-0 left-0 transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="px-2 mb-6 flex items-start justify-between">
          <div>
            <div className="text-[15px] font-semibold tracking-tight text-accent flex items-center gap-1.5">
              <span aria-hidden>◢</span> Nedory
            </div>
            <div className="text-[11px] text-ink-dim mt-0.5">
              <span className="text-accent">~</span> yours, fully local
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
        <ul className="flex flex-col gap-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors border-l-2 ${
                    active
                      ? "border-accent text-ink"
                      : "border-transparent text-ink-dim hover:text-ink"
                  }`}
                  style={active ? { background: "var(--surface-2)" } : undefined}
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
        <StatusRow />
      </nav>
    </>
  );
}
