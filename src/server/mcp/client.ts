// Minimal MCP client over the Streamable HTTP transport (JSON-RPC 2.0 POSTs,
// response either application/json or a text/event-stream of one message).
// Hand-rolled rather than depending on @modelcontextprotocol/sdk: this needs
// exactly three calls (initialize, tools/list, tools/call), and a tiny,
// dependency-free client is easier to keep Termux-safe and timeout-safe than
// pulling in the full SDK's transport/session machinery for three RPCs.

const FETCH_TIMEOUT_MS = 10000;
const PROTOCOL_VERSION = "2025-03-26";

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type McpServerConfig = {
  id: string;
  name: string;
  url: string;
  token?: string | null;
};

export class McpError extends Error {}

function headers(token: string | null | undefined, sessionId?: string, negotiated?: boolean) {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  if (sessionId) h["Mcp-Session-Id"] = sessionId;
  if (negotiated) h["MCP-Protocol-Version"] = PROTOCOL_VERSION;
  return h;
}

// Reads either a single JSON body or an SSE stream and returns the first
// JSON-RPC message found (tolerating servers that don't echo the request id).
async function readJsonRpcResponse(res: Response): Promise<{ result?: unknown; error?: { message?: string } }> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      try {
        return JSON.parse(trimmed.slice(5).trim());
      } catch {
        // not this line
      }
    }
    throw new McpError("no JSON-RPC message found in event stream");
  }
  // application/json, or a minimal server that omits content-type but still
  // returns JSON — either way this is the fallback path.
  return res.json();
}

async function rpc(
  url: string,
  token: string | null | undefined,
  sessionId: string | undefined,
  method: string,
  params: unknown,
): Promise<{ result: unknown; sessionId?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: headers(token, sessionId, method !== "initialize"),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new McpError(`${method} failed: ${res.status} ${res.statusText}`);
  const newSessionId = res.headers.get("mcp-session-id") ?? undefined;
  const body = await readJsonRpcResponse(res);
  if (body.error) throw new McpError(body.error.message ?? "MCP server returned an error");
  return { result: body.result, sessionId: newSessionId };
}

export type McpSession = { server: McpServerConfig; sessionId?: string };

/** One initialize handshake, reused across tools/list + any number of
 *  tools/call so a multi-tool turn doesn't pay the handshake cost per call. */
export async function mcpConnect(server: McpServerConfig): Promise<McpSession> {
  const { sessionId } = await rpc(server.url, server.token, undefined, "initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "home-server", version: "1.0" },
  });
  return { server, sessionId };
}

export async function mcpListTools(session: McpSession): Promise<McpTool[]> {
  const { result } = await rpc(session.server.url, session.server.token, session.sessionId, "tools/list", {});
  const tools = (result as { tools?: McpTool[] } | undefined)?.tools;
  return Array.isArray(tools) ? tools : [];
}

export async function mcpCallTool(
  session: McpSession,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const { result } = await rpc(session.server.url, session.server.token, session.sessionId, "tools/call", {
    name,
    arguments: args,
  });
  const content = (result as { content?: { type: string; text?: string }[] } | undefined)?.content;
  if (!Array.isArray(content)) return JSON.stringify(result ?? null);
  return content
    .map((c) => (c.type === "text" ? c.text ?? "" : `[${c.type} content]`))
    .join("\n")
    .slice(0, 4000);
}

/** Convenience for the "test connection" UI action: connect + list in one call. */
export async function mcpDiscoverTools(server: McpServerConfig): Promise<McpTool[]> {
  const session = await mcpConnect(server);
  return mcpListTools(session);
}
