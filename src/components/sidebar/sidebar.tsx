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
  Settings,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/brain", label: "Brain", icon: BrainCircuit },
  { href: "/cookbook", label: "Cookbook", icon: ChefHat },
  { href: "/library", label: "Library", icon: Library },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/files", label: "Files", icon: FolderOpenDot },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-56 shrink-0 h-screen border-r border-neutral-800 bg-neutral-900 flex flex-col py-4 px-3 sticky top-0">
      <div className="px-2 mb-6 text-lg font-semibold tracking-tight text-neutral-100">
        Home Server
      </div>
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-neutral-800 text-white"
                    : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                }`}
              >
                <Icon size={16} strokeWidth={2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
