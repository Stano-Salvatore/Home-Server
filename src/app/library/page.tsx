"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Book = {
  id: string;
  title: string;
  author: string | null;
  format: string;
  textExtracted: boolean;
};

export default function LibraryPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<Book | null>(null);
  const router = useRouter();

  function fetchBooks() {
    return fetch("/api/library")
      .then((r) => r.json())
      .then((data) => data.books ?? []);
  }

  useEffect(() => {
    fetchBooks().then(setBooks);
  }, []);

  async function rescan() {
    setScanning(true);
    setScanMessage(null);
    try {
      const res = await fetch("/api/library", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setBooks(data.books ?? []);
      setScanMessage(
        `Scanned ${data.summary.scanned} files — ${data.summary.added} added, ${data.summary.updated} updated.`,
      );
    } catch (err) {
      setScanMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }

  async function askAboutBook() {
    const modelsRes = await fetch("/api/models");
    const modelsData = await modelsRes.json();
    const firstOption = modelsData.options?.[0];
    if (!firstOption) {
      setScanMessage("No running or installed models found — start one from Cookbook first.");
      return;
    }
    const res = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        backend: firstOption.backend,
        modelId: firstOption.id,
        title: selected ? `About: ${selected.title}` : "New Chat",
        ragEnabled: true,
      }),
    });
    const data = await res.json();
    router.push(`/chat/${data.conversation.id}`);
  }

  const filtered = books.filter((b) => {
    const q = query.toLowerCase();
    return !q || b.title.toLowerCase().includes(q) || (b.author ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink mb-1">
            Bibliotheca <span className="text-ink-dim text-sm font-normal">· Athena&apos;s library</span>
          </h1>
          <p className="text-sm text-ink-dim">
            Drop epub/pdf files into your configured library folder, then rescan.
          </p>
        </div>
        <Button variant="secondary" onClick={rescan} disabled={scanning}>
          {scanning ? "Scanning…" : "Rescan Library"}
        </Button>
      </div>

      {scanMessage && <p className="text-sm text-neutral-400 mb-4">{scanMessage}</p>}

      <input
        className="w-full max-w-sm rounded bg-neutral-950 border border-neutral-800 px-3 py-1.5 text-sm mb-6"
        placeholder="Search by title or author…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-500">No books yet. Add files and rescan.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-5">
          {filtered.map((book) => (
            <button key={book.id} onClick={() => setSelected(book)} className="text-left group">
              <div className="aspect-[2/3] rounded-md overflow-hidden border border-neutral-800 bg-neutral-900 mb-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/library/${book.id}/cover`}
                  alt={book.title}
                  className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                />
              </div>
              <div className="text-sm text-neutral-100 truncate">{book.title}</div>
              {book.author && <div className="text-xs text-neutral-500 truncate">{book.author}</div>}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setSelected(null)}
        >
          <Card className="p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/library/${selected.id}/cover`}
                alt={selected.title}
                className="w-28 aspect-[2/3] object-cover rounded border border-neutral-800"
              />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-neutral-100">{selected.title}</h2>
                {selected.author && <p className="text-sm text-neutral-400">{selected.author}</p>}
                <p className="text-xs text-neutral-600 mt-1 uppercase">{selected.format}</p>
                {!selected.textExtracted && (
                  <p className="text-xs text-yellow-500 mt-2">
                    Text could not be extracted from this file, so it isn&apos;t searchable via Brain.
                  </p>
                )}
                <div className="mt-4 flex gap-2">
                  <Button onClick={askAboutBook} disabled={!selected.textExtracted}>
                    Ask about this book
                  </Button>
                  <Button variant="ghost" onClick={() => setSelected(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
