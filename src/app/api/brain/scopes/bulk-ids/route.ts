import { NextRequest, NextResponse } from "next/server";
import { bulkAssignScopeByIds } from "@/server/brain/scopes";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { scopeId, docIds } = await req.json();
  if (!scopeId || !Array.isArray(docIds)) {
    return NextResponse.json({ error: "scopeId and docIds[] are required" }, { status: 400 });
  }
  const added = bulkAssignScopeByIds(scopeId, docIds);
  return NextResponse.json({ added });
}
