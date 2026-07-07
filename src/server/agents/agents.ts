import { getSetting, setSetting } from "@/server/settings/config";
import { newId } from "@/server/util/hash";

export type Agent = {
  id: string;
  name: string;
  emoji: string;
  modelTag: string; // Ollama tag, e.g. "scriptoria:latest" — resolved to a node at launch
  systemPrompt?: string;
  description?: string;
  wikiDefault?: boolean; // start conversations with Wikipedia grounding on
  color?: string; // node ring color in the Brain graph
};

const AGENTS_KEY = "agents";

const ATHENA_GOLD = "#f0ad4e";
const EMERGI_GREEN = "#50fa7b";
const GEMMI_BLUE = "#5aa0f0";

/** Persona defaults: if a node has a model whose tag contains the keyword,
 *  seed a matching agent on first load. */
const PERSONA_SEEDS: {
  keyword: string;
  name: string;
  emoji: string;
  description: string;
  wikiDefault?: boolean;
  color: string;
}[] = [
  {
    keyword: "scriptoria",
    name: "Athena",
    emoji: "🦉",
    description: "Local book & knowledge base",
    wikiDefault: true,
    color: ATHENA_GOLD,
  },
  {
    keyword: "emergi",
    name: "Emergi",
    emoji: "❤️‍🩹",
    description: "Biometric health feedback",
    color: EMERGI_GREEN,
  },
  {
    keyword: "gemmi",
    name: "Gemmi",
    emoji: "⚙️",
    description: "SysOps logging & precision",
    color: GEMMI_BLUE,
  },
];

/** One-time reconcile so agents seeded with the old emoji defaults pick up the
 *  new ones — but only if the user hasn't customized them. */
export function migrateAgentEmojis() {
  if (getSetting("agents_emoji_v2")) return;
  const updates: Record<string, { from: string; to: string }> = {
    Emergi: { from: "🚑", to: "❤️‍🩹" },
    Gemmi: { from: "💎", to: "⚙️" },
  };
  const agents = listAgents();
  let changed = false;
  for (const a of agents) {
    const u = updates[a.name];
    if (u && a.emoji === u.from) {
      a.emoji = u.to;
      changed = true;
    }
  }
  if (changed) saveAgents(agents);
  setSetting("agents_emoji_v2", "1");
}

/** One-time: turn on Wikipedia grounding for the seeded Athena persona. */
export function migrateAgentWikiDefault() {
  if (getSetting("agents_wiki_v1")) return;
  const agents = listAgents();
  let changed = false;
  for (const a of agents) {
    if (a.name === "Athena" && a.wikiDefault === undefined) {
      a.wikiDefault = true;
      changed = true;
    }
  }
  if (changed) saveAgents(agents);
  setSetting("agents_wiki_v1", "1");
}

/** One-time: give the persona agents their graph colors. */
export function migrateAgentColors() {
  if (getSetting("agents_color_v1")) return;
  const byName: Record<string, string> = {
    Athena: ATHENA_GOLD,
    Emergi: EMERGI_GREEN,
    Gemmi: GEMMI_BLUE,
  };
  const agents = listAgents();
  let changed = false;
  for (const a of agents) {
    if (!a.color && byName[a.name]) {
      a.color = byName[a.name];
      changed = true;
    }
  }
  if (changed) saveAgents(agents);
  setSetting("agents_color_v1", "1");
}

export function listAgents(): Agent[] {
  const raw = getSetting(AGENTS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Agent[];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through
    }
  }
  return [];
}

function saveAgents(agents: Agent[]) {
  setSetting(AGENTS_KEY, JSON.stringify(agents));
}

export function getAgent(id: string): Agent | undefined {
  return listAgents().find((a) => a.id === id);
}

export function addAgent(input: Omit<Agent, "id">): Agent {
  const agent: Agent = { id: newId("agent"), ...input };
  saveAgents([...listAgents(), agent]);
  return agent;
}

export function updateAgent(id: string, patch: Partial<Omit<Agent, "id">>): Agent | undefined {
  const agents = listAgents();
  const idx = agents.findIndex((a) => a.id === id);
  if (idx === -1) return undefined;
  agents[idx] = { ...agents[idx], ...patch };
  saveAgents(agents);
  return agents[idx];
}

export function deleteAgent(id: string) {
  saveAgents(listAgents().filter((a) => a.id !== id));
}

/** One-time seed: match installed model tags against the persona map. */
export function seedAgentsFromTags(installedTags: string[]): Agent[] {
  if (listAgents().length > 0) return listAgents();
  const seeded: Agent[] = [];
  for (const seed of PERSONA_SEEDS) {
    const tag = installedTags.find((t) => t.toLowerCase().includes(seed.keyword));
    if (tag) {
      seeded.push({
        id: newId("agent"),
        name: seed.name,
        emoji: seed.emoji,
        modelTag: tag,
        description: seed.description,
        wikiDefault: seed.wikiDefault,
        color: seed.color,
      });
    }
  }
  if (seeded.length > 0) saveAgents(seeded);
  return seeded;
}
