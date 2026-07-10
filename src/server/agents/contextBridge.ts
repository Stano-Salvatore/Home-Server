import type { Agent } from "./agents";

const MAX_CONTEXT_CHARS = 6000;
const FETCH_TIMEOUT_MS = 8000;

/**
 * One-shot GET against an agent's configured context source (e.g. a health
 * API), returned as plain text for injection into the system prompt. This is
 * intentionally not a full MCP client — no tool discovery or multi-step
 * tool calls, just "fetch this URL, hand the model what came back."
 */
export async function fetchAgentContext(agent: Agent): Promise<string | null> {
  const url = agent.contextUrl?.trim();
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: agent.contextToken?.trim()
        ? { Authorization: `Bearer ${agent.contextToken.trim()}` }
        : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    return text.length > MAX_CONTEXT_CHARS ? text.slice(0, MAX_CONTEXT_CHARS) + "\n…(truncated)" : text;
  } catch {
    return null;
  }
}
