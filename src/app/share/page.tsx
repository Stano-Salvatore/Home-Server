"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const MINUTE_PRESETS = [15, 60, 24 * 60];

function ShareCapture() {
  const params = useSearchParams();
  const title = params.get("title") || "";
  const text = params.get("text") || "";
  const url = params.get("url") || "";

  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState<"note" | "reminder" | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasContent = Boolean(title || text || url);

  async function save(mode: "note" | "reminder") {
    setBusy(mode);
    setError(null);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, title, text, url, inMinutes: minutes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setResult(mode === "note" ? "Saved as a note." : `Reminder set for ${minutes}m from now.`);
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center px-4 gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-accent flex items-center gap-2">
          <span aria-hidden>◢</span> Shared to Nedory
        </h1>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-4">
        {!hasContent ? (
          <p className="text-sm text-ink-dim text-center">Nothing was shared.</p>
        ) : (
          <>
            <Card className="p-4 flex flex-col gap-1">
              {title && <p className="text-sm font-medium text-ink">{title}</p>}
              {text && <p className="text-sm text-ink-dim whitespace-pre-wrap">{text}</p>}
              {url && (
                <a href={url} className="text-xs text-accent underline break-all">
                  {url}
                </a>
              )}
            </Card>

            {result ? (
              <p className="text-sm text-term-green text-center">{result}</p>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => void save("note")}
                  disabled={busy !== null}
                  className="justify-center"
                >
                  {busy === "note" ? "Saving…" : "Save as note"}
                </Button>

                <div className="flex items-center gap-2">
                  {MINUTE_PRESETS.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMinutes(m)}
                      className={`flex-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                        minutes === m
                          ? "border-accent text-accent"
                          : "border-[var(--border)] text-ink-dim hover:text-ink"
                      }`}
                    >
                      {m < 60 ? `${m}m` : m === 60 ? "1h" : "tomorrow"}
                    </button>
                  ))}
                </div>
                <Button
                  onClick={() => void save("reminder")}
                  disabled={busy !== null}
                  className="justify-center"
                >
                  {busy === "reminder" ? "Setting…" : "Remind me"}
                </Button>
              </>
            )}

            {error && <p className="text-xs text-term-red text-center">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={null}>
      <ShareCapture />
    </Suspense>
  );
}
