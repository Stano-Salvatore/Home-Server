import { loadSettings } from "@/server/settings/config";
import type { BuiltinTool } from "./types";

// Home Assistant's REST API, fronted as two tool-calling-friendly tools
// instead of one-per-device. The small planner model can't reliably know
// exact entity_ids ("climate.living_room_ac_a3f1"), so home_assistant_control
// takes a fuzzy natural-language `entity` string and resolves it server-side
// against the live device list — the matching burden sits in code, not in a
// 2-8B model's one-shot tool call.

type HaState = { entity_id: string; state: string; attributes?: Record<string, unknown> };

const FETCH_TIMEOUT_MS = 8000;

export function homeAssistantConfigured(): boolean {
  const s = loadSettings();
  return Boolean(s.homeAssistantUrl.trim() && s.homeAssistantToken.trim());
}

async function haFetch(path: string, init?: RequestInit): Promise<unknown> {
  const s = loadSettings();
  const base = s.homeAssistantUrl.trim().replace(/\/$/, "");
  const token = s.homeAssistantToken.trim();
  if (!base || !token) return null;
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Home Assistant ${path} failed: ${res.status} ${res.statusText}`);
  return res.json();
}

async function listStates(): Promise<HaState[]> {
  const data = await haFetch("/api/states");
  return Array.isArray(data) ? (data as HaState[]) : [];
}

function friendlyName(s: HaState): string {
  const name = s.attributes?.friendly_name;
  return typeof name === "string" && name ? name : s.entity_id;
}

// Cheap substring/token scoring — good enough for a handful of named
// devices (an AC, a socket, a few lights), not a real search index.
function matchScore(query: string, s: HaState): number {
  const q = query.trim().toLowerCase();
  const id = s.entity_id.toLowerCase();
  const name = friendlyName(s).toLowerCase();
  if (id === q || name === q) return 100;
  let score = 0;
  if (name.includes(q) || q.includes(name)) score += 50;
  if (id.includes(q)) score += 30;
  const qTokens = q.split(/\s+/).filter(Boolean);
  const nameTokens = name.split(/\s+/).filter(Boolean);
  score += qTokens.filter((t) => nameTokens.includes(t)).length * 10;
  return score;
}

function findBestMatch(query: string, states: HaState[]): HaState | null {
  let best: HaState | null = null;
  let bestScore = 0;
  for (const s of states) {
    const score = matchScore(query, s);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore > 0 ? best : null;
}

const ACTION_ALIASES: Record<string, string> = {
  on: "turn_on",
  "turn on": "turn_on",
  off: "turn_off",
  "turn off": "turn_off",
  toggle: "toggle",
};

function normalizeService(action: string): string {
  const a = action.trim().toLowerCase();
  return ACTION_ALIASES[a] ?? a.replace(/\s+/g, "_");
}

export const HOME_ASSISTANT_TOOLS: BuiltinTool[] = [
  {
    name: "home_assistant_list",
    description:
      "List Home Assistant devices and their current state, optionally filtered by domain " +
      '(e.g. "climate", "switch", "light"). Use to check what is currently on/off, or to find ' +
      "a device before controlling it.",
    call: async (args) => {
      const domain = typeof args.domain === "string" ? args.domain.trim().toLowerCase() : "";
      const states = await listStates();
      const filtered = domain ? states.filter((s) => s.entity_id.startsWith(`${domain}.`)) : states;
      if (filtered.length === 0) return domain ? `No ${domain} entities found.` : "No entities found.";
      return filtered
        .slice(0, 40)
        .map((s) => `${s.entity_id} (${friendlyName(s)}) — ${s.state}`)
        .join("\n");
    },
  },
  {
    name: "home_assistant_control",
    description:
      'Control a Home Assistant device — turn it on/off/toggle. `entity` is a natural name (e.g. ' +
      '"AC", "living room socket") matched fuzzily against installed devices, or an exact ' +
      'entity_id. `action` is "on", "off", "toggle", or any other Home Assistant service name for ' +
      "that device's domain.",
    call: async (args) => {
      const entityQuery = typeof args.entity === "string" ? args.entity.trim() : "";
      const action = typeof args.action === "string" ? args.action.trim() : "";
      if (!entityQuery || !action) return "Missing entity or action.";
      const states = await listStates();
      const match = findBestMatch(entityQuery, states);
      if (!match) return `No Home Assistant device matching "${entityQuery}" found.`;
      const domain = match.entity_id.split(".")[0];
      const service = normalizeService(action);
      await haFetch(`/api/services/${domain}/${service}`, {
        method: "POST",
        body: JSON.stringify({ entity_id: match.entity_id }),
      });
      return `${friendlyName(match)}: ${service.replace(/_/g, " ")} done.`;
    },
  },
];
