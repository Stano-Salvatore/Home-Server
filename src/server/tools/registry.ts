import type { Agent } from "@/server/agents/agents";
import { mcpConnect, mcpListTools, mcpCallTool, type McpSession } from "@/server/mcp/client";
import { getBuiltinTools } from "./builtin";
import type { ToolDef } from "./types";

export type ToolContext = {
  tools: ToolDef[];
  call: (name: string, args: Record<string, unknown>) => Promise<string>;
};

// MCP tool names are only unique within their own server, so cross-server
// collisions get namespaced: "<serverId>__<toolName>". Built-ins keep their
// bare nedory_* name since there's only ever one of those.
function qualify(serverId: string, toolName: string): string {
  return `${serverId}__${toolName}`;
}

/**
 * Builds the full tool set for one turn: built-ins (always) plus whatever
 * each of the agent's configured MCP servers currently exposes. A server
 * that's down or slow just contributes nothing — this must never throw or
 * block the whole turn on one bad endpoint.
 */
export async function buildToolContext(agent: Agent): Promise<ToolContext | null> {
  if (!agent.toolsEnabled) return null;

  const builtins = getBuiltinTools();
  const defs: ToolDef[] = [...builtins.map(({ name, description }) => ({ name, description }))];
  const dispatch = new Map<string, (args: Record<string, unknown>) => Promise<string>>();
  for (const t of builtins) dispatch.set(t.name, t.call);

  const servers = agent.mcpServers ?? [];
  const sessions = await Promise.allSettled(
    servers.map(async (s) => ({ server: s, session: await mcpConnect(s) })),
  );

  await Promise.all(
    sessions.map(async (outcome) => {
      if (outcome.status !== "fulfilled") return;
      const { server, session }: { server: (typeof servers)[number]; session: McpSession } = outcome.value;
      try {
        const tools = await mcpListTools(session);
        for (const tool of tools) {
          const qualified = qualify(server.id, tool.name);
          defs.push({ name: qualified, description: tool.description ?? tool.name });
          dispatch.set(qualified, (args) => mcpCallTool(session, tool.name, args));
        }
      } catch {
        // this server just contributes no tools this turn
      }
    }),
  );

  if (defs.length === 0) return null;
  return {
    tools: defs,
    call: async (name, args) => {
      const fn = dispatch.get(name);
      if (!fn) return `Unknown tool: ${name}`;
      try {
        return await fn(args);
      } catch (err) {
        return `Tool ${name} failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}
