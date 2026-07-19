import { litertlmCall } from "@/server/backends/litertlm";

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
  const text = await litertlmCall(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `User: ${userContent.slice(0, 500)}\nAssistant: ${assistantContent.slice(0, 500)}`,
      },
    ],
    { maxTokens: 20, temperature: 0.3, timeoutMs: TIMEOUT_MS },
  );
  if (!text) return null;
  const cleaned = text
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/[.!?]+$/, "")
    .slice(0, MAX_TITLE_CHARS)
    .trim();
  return cleaned || null;
}
