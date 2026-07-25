import { NextResponse } from "next/server";
import { backendFor } from "@/server/backends/registry";
import { litertlmModelId } from "@/server/backends/litertlm";
import { webSearch } from "@/server/search/websearch";
import { getBuiltinTools } from "@/server/tools/builtin";
import { planToolCalls } from "@/server/tools/planner";
import type { ChatMessage } from "@/server/backends/types";

export const runtime = "nodejs";

// One-shot, stateless: no conversation row, no history. The S21 voice loop
// (bin/nedory-voice) posts a transcript here and reads `text` back through
// termux-tts-speak — there's nothing for a UI to render, so this skips the
// conversations table entirely rather than creating a throwaway thread per
// question.
//
// Tools always come from getBuiltinTools() (Nedory's own node/hardware
// status, plus Home Assistant control if it's configured in Settings) —
// deliberately not routed through a specific Agent's mcpServers the way
// chat is. Voice has no persona/agent selection step, so it gets the same
// tool set regardless of who or what asks it a question.
const SYSTEM_PROMPT =
  "You are Nedory, a voice assistant answering out loud through a phone speaker. " +
  "Reply in 1-3 short spoken sentences — plain conversational prose only. " +
  "Never use markdown, bullet points, headers, links, or citation brackets. " +
  "If a tool result confirms an action was taken, confirm it happened in plain words. " +
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
    // No single-underscore italic rule: tool names/entity ids the model
    // sometimes echoes back (e.g. "home_assistant_control") are plain
    // snake_case, not markdown italics — stripping single underscores
    // mangled them into run-together words ("homeassistantcontrol").
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const tools = getBuiltinTools();

  // Web search and tool-call planning are independent — run them together
  // rather than paying both timeouts in sequence. Both already degrade to
  // "nothing" on failure (webSearch() -> [], planToolCalls() -> []), so a
  // dead search provider or a planner timeout just means less grounding,
  // never a broken voice loop.
  const [hits, calls] = await Promise.all([
    webSearch(text, 4).catch(() => []),
    planToolCalls(
      text,
      tools.map(({ name, description }) => ({ name, description })),
    ).catch(() => []),
  ]);

  // Each tool's own return string is already human-readable prose (e.g.
  // "AC: turn off done.") — no need to prefix it with the raw snake_case
  // tool name, which the model would sometimes echo back verbatim into an
  // otherwise-spoken reply.
  const toolResults = await Promise.all(
    calls.map(async (c) => {
      const tool = tools.find((t) => t.name === c.tool);
      if (!tool) return null;
      try {
        return await tool.call(c.args);
      } catch (err) {
        return `${c.tool} failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }),
  );

  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
  if (hits.length > 0) {
    const context = hits.map((h, i) => `${i + 1}. ${h.title} — ${h.snippet}`).join("\n");
    messages.push({ role: "system", content: `Recent web results, for context:\n${context}` });
  }
  const usedToolResults = toolResults.filter((r): r is string => r !== null);
  if (usedToolResults.length > 0) {
    messages.push({ role: "system", content: `Tool results:\n${usedToolResults.join("\n")}` });
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
