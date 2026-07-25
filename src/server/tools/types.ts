// Plain-English tool description handed to the small local model doing tool
// selection — deliberately not a full JSON Schema, since a 2-8B model reads
// a one-line description more reliably than it validates against a schema.
export type ToolDef = {
  name: string;
  description: string;
};

export type ToolCall = { tool: string; args: Record<string, unknown> };

export type BuiltinTool = ToolDef & { call: (args: Record<string, unknown>) => Promise<string> };
