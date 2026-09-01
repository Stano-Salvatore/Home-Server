"use client";

import { useRef, useState } from "react";
import { Mic, Loader2 } from "lucide-react";

// Push-to-talk for the composer: tap to record, tap again to stop; the clip
// goes to /api/voice/transcribe (whisper on the fleet's STT node) and the
// transcript lands in the input for review — deliberately NOT auto-sent, so
// a mis-hearing ("Nedory" -> "Netary") is a one-glance fix, not a wrong
// message in the conversation.

export function MicButton({ onText }: { onText: (text: string) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState("busy");
        try {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          const form = new FormData();
          form.append("audio", blob, "clip.webm");
          const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          if (data.text) onText(data.text);
          else setError("Heard nothing — try again closer to the mic");
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setState("idle");
        }
      };
      rec.start();
      recRef.current = rec;
      setState("recording");
    } catch {
      setError("Microphone access denied");
      setState("idle");
    }
  }

  function stop() {
    recRef.current?.stop();
    recRef.current = null;
  }

  return (
    <span className="relative">
      <button
        onClick={() => (state === "recording" ? stop() : state === "idle" ? start() : undefined)}
        aria-label={state === "recording" ? "Stop recording" : "Record a voice message"}
        title={error ?? (state === "recording" ? "Tap to stop" : "Tap to speak")}
        className={`rounded-lg border p-2 transition-colors ${
          state === "recording" ? "text-term-red animate-pulse" : "text-ink-dim hover:text-ink"
        }`}
        style={{ borderColor: state === "recording" ? "var(--accent)" : "var(--border)" }}
        disabled={state === "busy"}
      >
        {state === "busy" ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
      </button>
      {error && (
        <span className="absolute bottom-full right-0 mb-1 whitespace-nowrap rounded border px-2 py-0.5 text-[10px] text-term-red"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
