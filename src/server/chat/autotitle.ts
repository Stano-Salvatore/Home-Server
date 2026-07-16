import { litertlmBaseUrl, litertlmModelId } from "@/server/backends/litertlm";

// Same architecture as brain/planner.ts and tools/planner.ts: one small-model
// structured call, hard timeout, defensive parsing, silent no-op on any
// failure — a conversation just keeps its "New Chat" default title rather
// than ever blocking or breaking the reply that triggered this.

const TIMEOUT_MS = 3000;
const MAX_TITLE_CHARS = 60;

const SYSTEM_PROMPT =
  "Reply with ONLY a short title (3-6 words) summarizing what this conversation is about — " +
  "no quotes, no trailing punctuation, no prose or explanation, just the title itself.";

export async function generateTitle(userContent: string, assistantContent: string): Promise<string | null> {
  try {
    const res = await fetch(`${litertlmBaseUrl()}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: litertlmModelId(),
        stream: false,
        max_tokens: 20,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `User: ${userContent.slice(0, 500)}\nAssistant: ${assistantContent.slice(0, 500)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: unknown = data.choices?.[0]?.message?.content;
    if (typeof text !== "string") return null;
    const cleaned = text
      .trim()
      .replace(/^["'“”]+|["'“”]+$/g, "")
      .replace(/[.!?]+$/, "")
      .slice(0, MAX_TITLE_CHARS)
      .trim();
    return cleaned || null;
  } catch {
    return null;
  }
}
