"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!password || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Login failed");
        return;
      }
      const next = params.get("next") || "/chat";
      // Full navigation (not router.push) so the proxy-gated page re-fetches
      // with the just-set cookie already attached.
      window.location.href = next;
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center px-4 gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-accent flex items-center gap-2">
          <span aria-hidden>◢</span> Nedory
        </h1>
        <p className="text-sm text-ink-dim">enter the password to continue</p>
      </div>
      <div
        className="w-full max-w-sm rounded-xl border p-4 flex flex-col gap-3"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <input
          autoFocus
          type="password"
          className="w-full rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
        {error && <p className="text-xs text-term-red">{error}</p>}
        <button
          onClick={() => void submit()}
          disabled={!password || loading}
          className="rounded-lg bg-accent text-black py-2 text-sm font-medium disabled:opacity-40 hover:bg-accent-hover transition-colors"
        >
          {loading ? "Checking…" : "Unlock"}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
