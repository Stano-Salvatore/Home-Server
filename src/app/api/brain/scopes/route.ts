import { NextRequest, NextResponse } from "next/server";
import { setDocScopes, getDocScopes, getAllScopeMembers } from "@/server/brain/scopes";
import { listCustomNodes } from "@/server/brain/customNodes";

export const runtime = "nodejs";

// GET ?docId=… → the scopes a doc is in. GET (no docId) → the scope nodes
// available to assign to, plus the full membership map.
export async function GET(req: NextRequest) {
  const docId = new URL(req.url).searchParams.get("docId");
  if (docId) return NextResponse.json({ scopeIds: getDocScopes(docId) });
  return NextResponse.json({
    scopes: listCustomNodes().map((n) => ({ id: n.id, label: n.label, color: n.color, emoji: n.emoji })),
    members: getAllScopeMembers(),
  });
}

export async function PUT(req: NextRequest) {
  const { docId, scopeIds } = await req.json();
  if (!docId || !Array.isArray(scopeIds)) {
    return NextResponse.json({ error: "docId and scopeIds[] are required" }, { status: 400 });
  }
  setDocScopes(docId, scopeIds);
  return NextResponse.json({ scopeIds });
}
