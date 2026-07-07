import { getSetting, setSetting } from "@/server/settings/config";
import { newId } from "@/server/util/hash";

export type Agent = {
  id: string;
  name: string;
  emoji: string;
  modelTag: string; // Ollama tag, e.g. "scriptoria:latest" — resolved to a node at launch
  systemPrompt?: string;
  description?: string;
};

const AGENTS_KEY = "agents";

/** Persona defaults: if a node has a model whose tag contains the keyword,
 *  seed a matching agent on first load. */
const PERSONA_SEEDS: { keyword: string; name: string; emoji: string; description: string }[] = [
  { keyword: "scriptoria", name: "Athena", emoji: "🦉", description: "Local book & knowledge base" },
  { keyword: "emergi", name: "Emergi", emoji: "🚑", description: "Biometric health feedback" },
  { keyword: "gemmi", name: "Gemmi", emoji: "💎", description: "SysOps logging & precision" },
];

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
      });
    }
  }
  if (seeded.length > 0) saveAgents(seeded);
  return seeded;
}
