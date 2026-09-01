import { litertlmCall } from "@/server/backends/litertlm";
import { ollamaBackend } from "@/server/backends/ollama";
import type { ChatMessage } from "@/server/backends/types";
import type { ToolDef, ToolCall } from "./types";
import { embedTexts, embedQuery } from "@/server/brain/embeddings";

// Tool selection follows the same shape as brain/planner.ts: one small-model
// structured-output call, hard timeout, defensive parsing, silent fallback
// to "no calls" on any failure. Multi-turn agentic tool loops don't hold up
// on 2-8B local models — one planning call per user message, then Nedory
// executes the calls itself, is the pattern that stays reliable at this
// model size and works identically across every backend.

const PLANNER_TIMEOUT_MS = 3000;
const MAX_CALLS = 3;

// litert-lm is the planner on the phone; nodes without it (the ryzen box)
// fall back to a small function-calling model on the default Ollama node.
// Same contract either way: null on any failure or timeout, never throw —
// the planner must never block or break chat.
const OLLAMA_PLANNER_TIMEOUT_MS = 12000;

// A 2-9B planner picks tools reliably up to roughly a dozen options and
// degrades badly past that (wrong tool, wrong arg values, even the wrong
// year in dates — all observed at 38 tools). When an agent exposes more
// than SHORTLIST_THRESHOLD tools, rank them against the question with the
// Brain's embedding model and show the planner only the top few. Tool
// vectors are cached per (name, description) for the process lifetime;
// embedding failure just skips the shortlist — same behavior as today.
const SHORTLIST_THRESHOLD = 12;
const SHORTLIST_KEEP = 10;
const toolVecCache = new Map<string, number[]>();

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

async function shortlistTools(userContent: string, tools: ToolDef[]): Promise<ToolDef[]> {
  if (tools.length <= SHORTLIST_THRESHOLD) return tools;
  try {
    const key = (t: ToolDef) => `${t.name}|${t.description}`;
    const missing = tools.filter((t) => !toolVecCache.has(key(t)));
    if (missing.length > 0) {
      const vecs = await embedTexts(missing.map((t) => `${t.name}: ${t.description}`));
      missing.forEach((t, i) => toolVecCache.set(key(t), vecs[i]));
    }
    const qv = await embedQuery(userContent);
    return tools
      .map((t) => ({ t, score: cosine(qv, toolVecCache.get(key(t))!) }))
      .sort((x, y) => y.score - x.score)
      .slice(0, SHORTLIST_KEEP)
      .map((x) => x.t);
  } catch {
    return tools;
  }
}

async function plannerCall(messages: ChatMessage[], ollamaFallbackTarget?: string): Promise<string | null> {
  const viaLitert = await litertlmCall(messages, {
    maxTokens: 200,
    temperature: 0,
    timeoutMs: PLANNER_TIMEOUT_MS,
  });
  if (viaLitert) return viaLitert;
  if (!ollamaFallbackTarget) return null;
  try {
    return await Promise.race([
      ollamaBackend.chatComplete(ollamaFallbackTarget, messages),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), OLLAMA_PLANNER_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

function systemPrompt(tools: ToolDef[]): string {
  const list = tools
    .map((t) => `- ${t.name}: ${t.description}${t.argsHint ? ` [args: ${t.argsHint}]` : ""}`)
    .join("\n");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bratislava" });
  const weekday = new Date().toLocaleDateString("en-GB", { weekday: "long", timeZone: "Europe/Bratislava" });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Bratislava" });
  return (
    `Today is ${weekday} ${today} — use this exact year for all relative dates; yesterday was ${yesterday}. For date-range args be inclusive: last night / yesterday means startDate=${yesterday}, endDate=${today}. ` +
    `You decide which tools (if any) are needed to answer the user's question. Available tools:\n${list}\n\n` +
    `Reply with ONLY a JSON object, no prose, no markdown fences: {"calls": [{"tool": string, "args": object}]}. ` +
    `Use at most ${MAX_CALLS} calls, only the ones actually relevant — most questions need zero or one. ` +
    `Prefer the most specific matching tool over broad summaries (e.g. a sleep question wants the sleep tool, not a daily summary). Always include every arg marked required — resolve relative dates (today, last night, this week) to concrete YYYY-MM-DD values yourself. ` +
    `If no tool is relevant, reply {"calls": []}.`
  );
}

export async function planToolCalls(
  userContent: string,
  tools: ToolDef[],
  // On nodes without litert-lm the planner reuses the conversation's own
  // (already-loaded) Ollama model — no extra VRAM, no load time, and
  // qwen-class models handle the JSON contract fine. functiongemma does
  // not: it refuses the prompt-JSON format (it only speaks the native
  // tools API), which is why there is no small dedicated planner tag here.
  ollamaFallbackTarget?: string,
): Promise<ToolCall[]> {
  if (tools.length === 0) return [];
  tools = await shortlistTools(userContent, tools);
  const validNames = new Set(tools.map((t) => t.name));

  const text = await plannerCall(
    [
      { role: "system", content: systemPrompt(tools) },
      { role: "user", content: userContent },
    ],
    ollamaFallbackTarget,
  );
  if (!text) return [];

  try {
    const parsed = JSON.parse(
      text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
    ) as { calls?: unknown };
    if (!Array.isArray(parsed.calls)) return [];

    const calls: ToolCall[] = [];
    for (const c of parsed.calls) {
      if (calls.length >= MAX_CALLS) break;
      if (!c || typeof c !== "object") continue;
      const tool = (c as Record<string, unknown>).tool;
      if (typeof tool !== "string" || !validNames.has(tool)) continue;
      const rawArgs = (c as Record<string, unknown>).args;
      calls.push({ tool, args: rawArgs && typeof rawArgs === "object" ? (rawArgs as Record<string, unknown>) : {} });
    }
    return calls;
  } catch {
    // Non-JSON reply — degrade to no tool calls (litertlmCall already
    // handles timeout/connection-refused by returning null above).
    return [];
  }
}
