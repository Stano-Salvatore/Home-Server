import { NextRequest, NextResponse } from "next/server";
import { bulkAssignScope } from "@/server/brain/scopes";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { scopeId, pathPrefix } = await req.json();
  if (!scopeId || !pathPrefix || !pathPrefix.trim()) {
    return NextResponse.json({ error: "scopeId and pathPrefix are required" }, { status: 400 });
  }
  const matched = bulkAssignScope(scopeId, pathPrefix.trim());
  return NextResponse.json({ matched });
}
