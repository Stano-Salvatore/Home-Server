"use client";

import { useState } from "react";
import { DocumentsTab } from "@/components/brain/documents-tab";
import { SearchTab } from "@/components/brain/search-tab";
import { MemoryTab } from "@/components/brain/memory-tab";
import { GraphTab } from "@/components/brain/graph-tab";

const TABS = ["Graph", "Documents", "Search", "Memory"] as const;
type Tab = (typeof TABS)[number];

export default function BrainPage() {
  const [tab, setTab] = useState<Tab>("Graph");

  return (
    <div className={tab === "Graph" ? "p-8 max-w-5xl" : "p-8 max-w-3xl"}>
      <h1 className="text-xl font-semibold text-ink mb-1">Brain</h1>
      <p className="text-sm text-ink-dim mb-6">
        RAG search over your notes/files, plus long-term memory the agents carry across chats.
      </p>

      <div className="flex gap-1 mb-5 border-b" style={{ borderColor: "var(--border)" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              tab === t
                ? "border-accent text-ink"
                : "border-transparent text-ink-dim hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Graph" && <GraphTab />}
      {tab === "Documents" && <DocumentsTab />}
      {tab === "Search" && <SearchTab />}
      {tab === "Memory" && <MemoryTab />}
    </div>
  );
}
