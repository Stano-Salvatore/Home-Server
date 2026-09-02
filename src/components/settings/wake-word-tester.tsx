"use client";

import { useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { wakeRegex } from "@/components/chat/mic-button";

// You cannot train Whisper here, but you can find out what it hears. Say the
// name, see the transcript, and if the wake word came back as something the
// list doesn't cover, add that spelling with one click. That is the whole
// "training" loop: the misheard forms are stable per voice and microphone, so
// a handful of samples is usually enough to make standby reliable.

export function WakeWordTester({
  words,
  onAddWord,
}: {
  words: string;
  onAddWord: (word: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const re = wakeRegex(words);
  const matched = heard !== null && re !== null && re.test(heard);
  // The word actually spoken, as whisper spelled it: first token of the
  // transcript, which is where the name sits when testing.
  const candidate =
    heard
      ?.replace(/[.,!?;:]/g, " ")
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase() ?? "";

  async function start() {
    setError(null);
    setHeard(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setBusy(true);
        try {
          const form = new FormData();
          form.append("audio", new Blob(chunks, { type: rec.mimeType || "audio/webm" }), "wake.webm");
          const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          setHeard((data.text ?? "").trim() || "(silence)");
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      setError("Microphone access denied — this page must be open over HTTPS.");
    }
  }

  function stop() {
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  }

  return (
    <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2">
        <button
          onClick={recording ? stop : () => void start()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs text-ink hover:text-accent disabled:opacity-50"
          style={{ borderColor: recording ? "var(--accent)" : "var(--border)" }}
        >
          {recording ? <Square size={13} /> : <Mic size={13} />}
          {recording ? "Stop and check" : busy ? "Listening…" : "Test the wake word"}
        </button>
        <span className="text-xs text-ink-dim">
          {recording ? "Say the name, then stop." : "Records you, shows what Whisper heard."}
        </span>
      </div>

      {heard !== null && (
        <div className="mt-2 text-xs">
          <span className="text-ink-dim">Heard: </span>
          <span className="font-mono text-ink">“{heard}”</span>
          {matched ? (
            <span className="ml-2 text-term-green">✓ this wakes Nedory</span>
          ) : (
            <span className="ml-2 text-term-red">✗ not in the wake list</span>
          )}
          {!matched && candidate.length >= 3 && (
            <button
              onClick={() => onAddWord(candidate)}
              className="ml-2 rounded bg-accent px-2 py-0.5 text-[11px] font-medium text-black"
            >
              Add “{candidate}”
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-term-red">{error}</p>}
    </div>
  );
}
