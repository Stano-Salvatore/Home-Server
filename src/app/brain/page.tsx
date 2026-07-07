"use client";

import { useState } from "react";
import { DocumentsTab } from "@/components/brain/documents-tab";
import { SearchTab } from "@/components/brain/search-tab";
import { MemoryTab } from "@/components/brain/memory-tab";

const TABS = ["Documents", "Search", "Memory"] as const;
type Tab = (typeof TABS)[number];

export default function BrainPage() {
  const [tab, setTab] = useState<Tab>("Documents");

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-xl font-semibold text-neutral-100 mb-1">Brain</h1>
      <p className="text-sm text-neutral-500 mb-6">
        RAG search over your notes/files, plus long-term memory the agent carries across chats.
      </p>

      <div className="flex gap-1 mb-5 border-b border-neutral-900">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              tab === t
                ? "border-accent text-ink"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Documents" && <DocumentsTab />}
      {tab === "Search" && <SearchTab />}
      {tab === "Memory" && <MemoryTab />}
    </div>
  );
}
