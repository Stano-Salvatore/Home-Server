// Plain-English tool description handed to the small local model doing tool
// selection — deliberately not a full JSON Schema, since a 2-8B model reads
// a one-line description more reliably than it validates against a schema.
export type ToolDef = {
  name: string;
  description: string;
  // Compact one-line rendering of the tool's parameters ("startDate (string,
  // required): Start date YYYY-MM-DD; …"), derived from the MCP inputSchema.
  // Without it the planner invents or omits args — a schema-required date
  // range fails validation and the whole tool silently contributes nothing.
  argsHint?: string;
};

export type ToolCall = { tool: string; args: Record<string, unknown> };

export type BuiltinTool = ToolDef & { call: (args: Record<string, unknown>) => Promise<string> };
