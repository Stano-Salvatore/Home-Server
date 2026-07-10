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
  migrateAthenaModelTag,
} from "@/server/agents/agents";
import { probeNodes } from "@/server/backends/registry";
import { getSetting } from "@/server/settings/config";

export const runtime = "nodejs";

export async function GET() {
  migrateAgentEmojis();
  migrateAgentWikiDefault();
  migrateAgentColors();

  let agents = listAgents();
  const athenaTagMigrated = !!getSetting("agents_athena_tag_v1");
  if (agents.length === 0 || !athenaTagMigrated) {
    // First run (seed persona agents), or the athena:scriptoria tag swap is
    // still pending — both need a fresh read of what's actually installed.
    const nodes = await probeNodes();
    const installed = [...new Set(nodes.flatMap((n) => n.installed))];
    migrateAthenaModelTag(installed);
    agents = agents.length === 0 ? seedAgentsFromTags(installed) : listAgents();
  }
  return NextResponse.json({ agents });
}

export async function POST(req: NextRequest) {
  const { name, emoji, modelTag, systemPrompt, description, wikiDefault, scopeId, contextUrl, contextToken } =
    await req.json();
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
    contextUrl: contextUrl || null,
    contextToken: contextToken || null,
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
