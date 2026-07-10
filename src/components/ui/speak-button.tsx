"use client";

import { useEffect, useState } from "react";
import { Volume2, Square } from "lucide-react";

// Strip markdown so the voice reads prose, not "star star heading".
function forSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ". code block. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_>~|]/g, "")
    .replace(/\n{2,}/g, ". ")
    .trim();
}

// Read a reply aloud using the browser's built-in speech synthesis — offline,
// no model, works on any device viewing the dashboard.
export function SpeakButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  if (!supported) return null;

  function toggle() {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(forSpeech(text));
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  }

  return (
    <button
      onClick={toggle}
      className="text-xs text-neutral-500 hover:text-neutral-300 inline-flex items-center gap-1"
      aria-label={speaking ? "Stop reading" : "Read aloud"}
    >
      {speaking ? <Square size={11} /> : <Volume2 size={12} />}
      {speaking ? "stop" : "read"}
    </button>
  );
}
