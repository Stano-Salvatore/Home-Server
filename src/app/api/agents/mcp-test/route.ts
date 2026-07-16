import { NextRequest, NextResponse } from "next/server";
import { mcpDiscoverTools } from "@/server/mcp/client";

export const runtime = "nodejs";

// Connectivity check for the agent editor's MCP server form: connect, list
// tools, report what was found (or why it failed) without saving anything.
export async function POST(req: NextRequest) {
  const { url, token } = await req.json();
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  try {
    const tools = await mcpDiscoverTools({ id: "test", name: "test", url, token: token || undefined });
    return NextResponse.json({ tools });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
