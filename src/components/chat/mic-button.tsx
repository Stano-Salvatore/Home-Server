"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Ear, Loader2 } from "lucide-react";

// Voice input, three modes:
//   off    — nothing captured.
//   active — dictation: segments transcribe at natural pauses, text lands in
//            the input; after AUTO_SEND_MS of silence the message auto-sends.
//   wake   — hands-free standby (Ear toggle): audio is captured and
//            transcribed, but DISCARDED unless a segment contains the wake
//            word ("Nedory" — plus the ways whisper mis-hears it). On a wake
//            hit: chime, switch to active, and anything spoken after the
//            name in the same breath is kept. After auto-send it returns to
//            wake standby, so "Nedory … question … (pause) … Nedory …" chains
//            turns without a single tap.
// Whisper transcribes segments, not streams; the level meter closes a
// segment after SILENCE_MS of quiet. Segments transcribe through an ordered
// promise chain. Wake-mode transcripts never touch the input.

const SILENCE_MS = 700;
const MIN_SEGMENT_MS = 800;
const SPEECH_RMS = 0.015;
const AUTO_SEND_MS = 5000;
// whisper's greatest hits for "Nedory", learned empirically
const WAKE_RE = /\b(nedory|nedori|nedary|netary|netery|nedery)\b[,.!?]?\s*/i;

type Mode = "off" | "wake" | "active";

export function MicButton({
  onText,
  onAutoSend,
}: {
  onText: (text: string) => void;
  onAutoSend?: () => void;
}) {
  const [mode, setMode] = useState<Mode>("off");
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const modeRef = useRef<Mode>("off");
  const wakeWantedRef = useRef(false); // return to standby after auto-send?
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const meterRef = useRef<number | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const segRef = useRef({ start: 0, lastLoud: 0, sawSpeech: false });
  const sentAnyRef = useRef(false);
  const cb = useRef({ onText, onAutoSend });
  cb.current = { onText, onAutoSend };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => teardown(), []);

  function setModeBoth(m: Mode) {
    modeRef.current = m;
    setMode(m);
  }

  function chime() {
    try {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = 0.06;
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.setValueAtTime(990, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch {
      // a silent chime is not worth an error
    }
  }

  function transcribe(blob: Blob, recordedIn: Mode) {
    if (blob.size < 1000) return;
    setPending((n) => n + 1);
    chainRef.current = chainRef.current.then(async () => {
      try {
        const form = new FormData();
        form.append("audio", blob, "seg.webm");
        const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        const text: string = (data.text ?? "").trim();
        if (!text) return;
        if (recordedIn === "active" && modeRef.current === "active") {
          cb.current.onText(text);
          sentAnyRef.current = true;
        } else if (recordedIn === "wake" && modeRef.current === "wake") {
          const m = text.match(WAKE_RE);
          if (m) {
            chime();
            setModeBoth("active");
            segRef.current.lastLoud = Date.now(); // fresh silence clock
            const rest = text.slice((m.index ?? 0) + m[0].length).trim();
            if (rest) {
              cb.current.onText(rest);
              sentAnyRef.current = true;
            }
          }
        }
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
    const recordedIn = modeRef.current;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const seg = segRef.current;
    rec.onstop = () => {
      if (seg.sawSpeech && Date.now() - seg.start >= MIN_SEGMENT_MS) {
        transcribe(new Blob(chunks, { type: rec.mimeType || "audio/webm" }), recordedIn);
      }
      if (modeRef.current !== "off" && streamRef.current) startSegment(streamRef.current);
    };
    seg.start = Date.now();
    seg.sawSpeech = false;
    rec.start();
    recRef.current = rec;
  }

  async function begin(target: Mode) {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      sentAnyRef.current = false;
      setModeBoth(target);

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      segRef.current.lastLoud = Date.now();

      startSegment(stream);
      meterRef.current = window.setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const seg = segRef.current;
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
          recRef.current.stop();
        }
        // hands-free send: dictated text exists, nothing in flight, 5s quiet
        if (
          modeRef.current === "active" &&
          sentAnyRef.current &&
          now - seg.lastLoud >= AUTO_SEND_MS
        ) {
          setPending((p) => {
            if (p === 0) {
              sentAnyRef.current = false;
              cb.current.onAutoSend?.();
              if (wakeWantedRef.current) setModeBoth("wake");
              else teardown();
            }
            return p;
          });
        }
      }, 100);
    } catch {
      setError("Microphone access denied");
      teardown();
    }
  }

  function teardown() {
    setModeBoth("off");
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

  function clickMic() {
    if (mode === "active") {
      if (wakeWantedRef.current) setModeBoth("wake");
      else teardown();
    } else if (mode === "wake") {
      setModeBoth("active"); // manual takeover from standby
      segRef.current.lastLoud = Date.now();
    } else {
      wakeWantedRef.current = false;
      void begin("active");
    }
  }

  function clickEar() {
    if (mode === "off") {
      wakeWantedRef.current = true;
      void begin("wake");
    } else {
      wakeWantedRef.current = false;
      teardown();
    }
  }

  return (
    <span className="relative flex items-center gap-1">
      <button
        onClick={clickEar}
        aria-label={mode === "off" ? "Enable wake word (Nedory)" : "Disable wake word"}
        title={
          mode === "wake"
            ? "Standing by for “Nedory” — tap to disable"
            : mode === "off"
              ? "Hands-free: listen for “Nedory”"
              : "Disable hands-free"
        }
        className={`rounded-lg border p-2 transition-colors ${
          mode === "wake" ? "text-accent" : "text-ink-dim hover:text-ink"
        }`}
        style={{ borderColor: mode === "wake" ? "var(--accent)" : "var(--border)" }}
      >
        <Ear size={16} />
      </button>
      <button
        onClick={clickMic}
        aria-label={mode === "active" ? "Stop dictation" : "Start dictation"}
        title={error ?? (mode === "active" ? "Listening — pause 5s to send" : "Tap to speak")}
        className={`rounded-lg border p-2 transition-colors ${
          mode === "active" ? "text-term-red animate-pulse" : "text-ink-dim hover:text-ink"
        }`}
        style={{ borderColor: mode === "active" ? "var(--accent)" : "var(--border)" }}
      >
        {mode === "off" && pending > 0 ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
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
