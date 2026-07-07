"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  BrainCircuit,
  ChefHat,
  Library,
  ListChecks,
  FolderOpenDot,
  Server,
  Settings,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/chat", label: "chat", icon: MessageSquare },
  { href: "/brain", label: "brain", icon: BrainCircuit },
  { href: "/cookbook", label: "cookbook", icon: ChefHat },
  { href: "/nodes", label: "nodes", icon: Server },
  { href: "/library", label: "library", icon: Library },
  { href: "/tasks", label: "tasks", icon: ListChecks },
  { href: "/files", label: "files", icon: FolderOpenDot },
  { href: "/settings", label: "settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      className="w-56 shrink-0 h-screen border-r flex flex-col py-4 px-3 sticky top-0"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="px-2 mb-6">
        <div className="text-[15px] font-semibold tracking-tight text-ink flex items-center gap-1.5">
          <span className="text-accent">◢</span> home_server
        </div>
        <div className="text-[11px] text-ink-dim mt-0.5">
          <span className="text-accent">~</span> local ai workspace
        </div>
      </div>
      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
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
    </nav>
  );
}
