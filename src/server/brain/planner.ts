import { litertlmCall } from "@/server/backends/litertlm";
import { listCustomNodes, type CustomNode } from "./customNodes";
import { isCatalogQuery, extractCatalogKeyword } from "./catalog";

// Classifies a Brain-enabled chat question into a retrieval mode, replacing
// regex-only intent detection (which can't keep up with phrasing variety or
// English/Slovak code-switching). The regex is kept as a zero-cost fast path
// for obvious enumeration phrasings; everything else goes to the local
// litert-lm model with a hard timeout, degrading to plain hybrid retrieval
// ("answer" mode — exactly today's behavior) if the model is slow, down, or
// replies with garbage. The planner must never block or break chat.

export type QueryPlan = {
  mode: "enumerate" | "answer" | "exists";
  entity: string | null; // the author/book/topic being asked about, as written
  scopeId: string | null; // resolved against real custom-node scopes, else null
};

const PLANNER_TIMEOUT_MS = 3000;
const FALLBACK: QueryPlan = { mode: "answer", entity: null, scopeId: null };

const SYSTEM_PROMPT =
  "You classify a user's question about their personal note library. Reply with ONLY a JSON " +
  'object, no prose, no markdown fences: {"mode": "enumerate"|"answer"|"exists", ' +
  '"entity": string|null, "scope": string|null}. mode=enumerate for \'list all/every/show ' +
  "everything' style requests wanting an exhaustive list; exists for 'do I have any...' yes/no " +
  "checks; answer for everything else. entity is the author/book/topic being asked about, " +
  "exactly as written. scope must be one of the provided scope names if one clearly matches " +
  "the entity or the query, else null. The user may write in English or Slovak.";

// Diacritics-insensitive label compare, matching the FTS tokenizer's
// tolerance — the model may echo "Bozi lide" for a scope named "Boží lidé".
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .trim();
}

// The model returns a scope NAME; only names that map onto a real custom
// node become a scopeId — model-invented IDs are never trusted.
function resolveScopeId(name: unknown, nodes: CustomNode[]): string | null {
  if (typeof name !== "string" || !name.trim()) return null;
  const target = fold(name);
  return nodes.find((n) => fold(n.label) === target)?.id ?? null;
}

export async function planQuery(userContent: string): Promise<QueryPlan> {
  // Fast path: the existing enumeration regex is precise when it does match,
  // and costs nothing — no model call for well-phrased catalog queries.
  if (isCatalogQuery(userContent)) {
    return { mode: "enumerate", entity: extractCatalogKeyword(userContent), scopeId: null };
  }

  const nodes = listCustomNodes();
  const text = await litertlmCall(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Known scopes: ${nodes.map((n) => n.label).join(", ")}\n\nQuestion: ${userContent}`,
      },
    ],
    { maxTokens: 64, temperature: 0, timeoutMs: PLANNER_TIMEOUT_MS },
  );
  if (!text) return FALLBACK;

  try {
    const parsed = JSON.parse(
      text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
    ) as { mode?: unknown; entity?: unknown; scope?: unknown };
    if (parsed.mode !== "enumerate" && parsed.mode !== "answer" && parsed.mode !== "exists") {
      return FALLBACK;
    }
    return {
      mode: parsed.mode,
      entity:
        typeof parsed.entity === "string" && parsed.entity.trim() ? parsed.entity.trim() : null,
      scopeId: resolveScopeId(parsed.scope, nodes),
    };
  } catch {
    // Non-JSON reply — degrade silently (litertlmCall already handles
    // timeout/connection-refused by returning null above).
    return FALLBACK;
  }
}
