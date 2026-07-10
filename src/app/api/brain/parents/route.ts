import { NextRequest, NextResponse } from "next/server";
import { getParentOverrides, setParentOverride } from "@/server/brain/parentOverrides";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ overrides: getParentOverrides() });
}

export async function PUT(req: NextRequest) {
  const { nodeId, parentId } = await req.json();
  if (!nodeId) return NextResponse.json({ error: "nodeId is required" }, { status: 400 });
  setParentOverride(nodeId, parentId ?? null);
  return NextResponse.json({ ok: true });
}
