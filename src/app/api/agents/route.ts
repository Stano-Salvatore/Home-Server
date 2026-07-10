import { NextRequest, NextResponse } from "next/server";
import {
  listAgents,
  addAgent,
  updateAgent,
  deleteAgent,
  seedAgentsFromTags,
  migrateAgentEmojis,
  migrateAgentWikiDefault,
  migrateAgentColors,
} from "@/server/agents/agents";
import { probeNodes } from "@/server/backends/registry";

export const runtime = "nodejs";

export async function GET() {
  migrateAgentEmojis();
  migrateAgentWikiDefault();
  migrateAgentColors();
  let agents = listAgents();
  if (agents.length === 0) {
    // First run: seed persona agents from whatever models are on the nodes.
    const nodes = await probeNodes();
    const installed = [...new Set(nodes.flatMap((n) => n.installed))];
    agents = seedAgentsFromTags(installed);
  }
  return NextResponse.json({ agents });
}

export async function POST(req: NextRequest) {
  const { name, emoji, modelTag, systemPrompt, description, wikiDefault, scopeId } = await req.json();
  if (!name || !modelTag) {
    return NextResponse.json({ error: "name and modelTag are required" }, { status: 400 });
  }
  const agent = addAgent({
    name,
    emoji: emoji || "🤖",
    modelTag,
    systemPrompt,
    description,
    wikiDefault: !!wikiDefault,
    scopeId: scopeId || null,
  });
  return NextResponse.json({ agent });
}

export async function PUT(req: NextRequest) {
  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const agent = updateAgent(id, patch);
  return NextResponse.json({ agent });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  deleteAgent(id);
  return NextResponse.json({ ok: true });
}
