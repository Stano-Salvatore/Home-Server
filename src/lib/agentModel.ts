import type { ModelOption } from "@/lib/types";

// Match an agent's model tag to an available Ollama model, tolerating the
// differences that otherwise make agents "silently not launch":
//   - Ollama reports "athena:latest" while the agent tag is just "athena"
//   - a node-scoped tag like "node123::athena"
export function resolveAgentOption(
  modelTag: string,
  options: ModelOption[],
): ModelOption | undefined {
  const norm = (s: string) => (s.split("::").pop() ?? s).replace(/:latest$/, "").toLowerCase();
  const want = norm(modelTag);
  return options.find((o) => o.backend === "ollama" && norm(o.label) === want);
}

export function agentModelOnline(modelTag: string, options: ModelOption[]): boolean {
  return resolveAgentOption(modelTag, options) !== undefined;
}
