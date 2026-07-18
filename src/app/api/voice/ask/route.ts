import { NextResponse } from "next/server";
import { backendFor } from "@/server/backends/registry";
import { litertlmModelId } from "@/server/backends/litertlm";
import { webSearch } from "@/server/search/websearch";
import type { ChatMessage } from "@/server/backends/types";

export const runtime = "nodejs";

// One-shot, stateless: no conversation row, no history. The S21 voice loop
// (bin/nedory-voice) posts a transcript here and reads `text` back through
// termux-tts-speak — there's nothing for a UI to render, so this skips the
// conversations table entirely rather than creating a throwaway thread per
// question.
const SYSTEM_PROMPT =
  "You are Nedory, a voice assistant answering out loud through a phone speaker. " +
  "Reply in 1-3 short spoken sentences — plain conversational prose only. " +
  "Never use markdown, bullet points, headers, links, or citation brackets. " +
  "If you don't know or can't find an answer, say so briefly instead of guessing.";

// Defensive cleanup for TTS: even instructed not to, small models sometimes
// still emit **bold**, headers, or [Sn]-style citation tags out of habit —
// termux-tts-speak would read the punctuation aloud otherwise.
function stripForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([WST]\d+)\]/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  // Best-effort grounding — webSearch() already degrades to [] on any
  // provider failure, so a dead/unconfigured search provider just means a
  // plain (un-grounded) answer instead of a broken voice loop.
  const hits = await webSearch(text, 4).catch(() => []);
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
  if (hits.length > 0) {
    const context = hits.map((h, i) => `${i + 1}. ${h.title} — ${h.snippet}`).join("\n");
    messages.push({ role: "system", content: `Recent web results, for context:\n${context}` });
  }
  messages.push({ role: "user", content: text });

  try {
    const backend = backendFor("litertlm");
    const raw = await backend.chatComplete(litertlmModelId(), messages);
    return NextResponse.json({ text: stripForSpeech(raw) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "voice ask failed" },
      { status: 502 },
    );
  }
}
