import { litertlmCall } from "@/server/backends/litertlm";
import type { ToolDef, ToolCall } from "./types";

// Tool selection follows the same shape as brain/planner.ts: one small-model
// structured-output call, hard timeout, defensive parsing, silent fallback
// to "no calls" on any failure. Multi-turn agentic tool loops don't hold up
// on 2-8B local models — one planning call per user message, then Nedory
// executes the calls itself, is the pattern that stays reliable at this
// model size and works identically across every backend.

const PLANNER_TIMEOUT_MS = 3000;
const MAX_CALLS = 3;

function systemPrompt(tools: ToolDef[]): string {
  const list = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  return (
    `You decide which tools (if any) are needed to answer the user's question. Available tools:\n${list}\n\n` +
    `Reply with ONLY a JSON object, no prose, no markdown fences: {"calls": [{"tool": string, "args": object}]}. ` +
    `Use at most ${MAX_CALLS} calls, only the ones actually relevant — most questions need zero or one. ` +
    `If no tool is relevant, reply {"calls": []}.`
  );
}

export async function planToolCalls(userContent: string, tools: ToolDef[]): Promise<ToolCall[]> {
  if (tools.length === 0) return [];
  const validNames = new Set(tools.map((t) => t.name));

  const text = await litertlmCall(
    [
      { role: "system", content: systemPrompt(tools) },
      { role: "user", content: userContent },
    ],
    { maxTokens: 200, temperature: 0, timeoutMs: PLANNER_TIMEOUT_MS },
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
