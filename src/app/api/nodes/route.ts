import { NextRequest, NextResponse } from "next/server";
import { listNodes, addNode, updateNode, deleteNode } from "@/server/nodes/nodes";
import { probeNodes } from "@/server/backends/registry";
import { listServers } from "@/server/backends/llamacpp";

export const runtime = "nodejs";

export async function GET() {
  const [statuses, llamacppServers] = await Promise.all([probeNodes(), listServers()]);
  return NextResponse.json({ nodes: statuses, llamacppServers });
}

export async function POST(req: NextRequest) {
  const { name, url } = await req.json();
  if (!name || !url) {
    return NextResponse.json({ error: "name and url are required" }, { status: 400 });
  }
  const node = addNode(name, url);
  return NextResponse.json({ node });
}

export async function PUT(req: NextRequest) {
  const { id, name, url } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const node = updateNode(id, { name, url });
  return NextResponse.json({ node });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const nodes = listNodes();
  if (nodes.length <= 1) {
    return NextResponse.json({ error: "Can't remove the last node" }, { status: 400 });
  }
  deleteNode(id);
  return NextResponse.json({ ok: true });
}
