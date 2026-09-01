"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Loader2 } from "lucide-react";

// Streaming push-to-talk: tap to start, speak freely, tap to finish. Whisper
// transcribes SEGMENTS, not a rolling stream, so "live" here means: a level
// meter watches the mic, and each natural pause (~700ms of quiet) closes the
// current segment, ships it to /api/voice/transcribe, and its text lands in
// the input while the next sentence is already being spoken. Segments are
// transcribed in order (a promise chain, not a race) so the text never
// arrives shuffled. Silent segments are dropped without a round-trip.

const SILENCE_MS = 700; // quiet gap that closes a segment
const MIN_SEGMENT_MS = 800; // ignore blips shorter than this
const SPEECH_RMS = 0.015; // level above which we consider it speech

export function MicButton({ onText }: { onText: (text: string) => void }) {
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(0); // segments still transcribing
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const meterRef = useRef<number | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const segStateRef = useRef({ start: 0, lastLoud: 0, sawSpeech: false });
  const activeRef = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => stop(), []); // unmount safety

  function transcribe(blob: Blob) {
    if (blob.size < 1000) return;
    setPending((n) => n + 1);
    chainRef.current = chainRef.current.then(async () => {
      try {
        const form = new FormData();
        form.append("audio", blob, "seg.webm");
        const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (data.text) onText(data.text);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setPending((n) => n - 1);
      }
    });
  }

  function startSegment(stream: MediaStream) {
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const seg = segStateRef.current;
    rec.onstop = () => {
      if (seg.sawSpeech && Date.now() - seg.start >= MIN_SEGMENT_MS) {
        transcribe(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      }
      if (activeRef.current && streamRef.current) startSegment(streamRef.current);
    };
    seg.start = Date.now();
    seg.lastLoud = Date.now();
    seg.sawSpeech = false;
    rec.start();
    recRef.current = rec;
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      activeRef.current = true;
      setActive(true);

      // level meter drives segmentation
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);

      startSegment(stream);
      meterRef.current = window.setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const seg = segStateRef.current;
        const now = Date.now();
        if (rms > SPEECH_RMS) {
          seg.lastLoud = now;
          seg.sawSpeech = true;
        } else if (
          seg.sawSpeech &&
          now - seg.lastLoud >= SILENCE_MS &&
          now - seg.start >= MIN_SEGMENT_MS &&
          recRef.current?.state === "recording"
        ) {
          recRef.current.stop(); // onstop ships the segment and starts the next
        }
      }, 100);
    } catch {
      setError("Microphone access denied");
      activeRef.current = false;
      setActive(false);
    }
  }

  function stop() {
    activeRef.current = false;
    setActive(false);
    if (meterRef.current !== null) {
      clearInterval(meterRef.current);
      meterRef.current = null;
    }
    if (recRef.current?.state === "recording") recRef.current.stop();
    recRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }

  return (
    <span className="relative">
      <button
        onClick={() => (active ? stop() : start())}
        aria-label={active ? "Stop listening" : "Start voice input"}
        title={error ?? (active ? "Listening — tap to finish" : "Tap to speak")}
        className={`rounded-lg border p-2 transition-colors ${
          active ? "text-term-red animate-pulse" : "text-ink-dim hover:text-ink"
        }`}
        style={{ borderColor: active ? "var(--accent)" : "var(--border)" }}
      >
        {!active && pending > 0 ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
      </button>
      {error && (
        <span
          className="absolute bottom-full right-0 mb-1 whitespace-nowrap rounded border px-2 py-0.5 text-[10px] text-term-red"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          {error}
        </span>
      )}
    </span>
  );
}
