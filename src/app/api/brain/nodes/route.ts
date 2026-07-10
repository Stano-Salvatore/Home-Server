import { NextRequest, NextResponse } from "next/server";
import {
  listCustomNodes,
  addCustomNode,
  updateCustomNode,
  deleteCustomNode,
} from "@/server/brain/customNodes";
import { removeScope } from "@/server/brain/scopes";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ nodes: listCustomNodes() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const node = addCustomNode(body);
  return NextResponse.json({ node });
}

export async function PATCH(req: NextRequest) {
  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const node = updateCustomNode(id, patch);
  return NextResponse.json({ node });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  deleteCustomNode(id);
  removeScope(id); // drop any document membership for this scope node
  return NextResponse.json({ ok: true });
}
