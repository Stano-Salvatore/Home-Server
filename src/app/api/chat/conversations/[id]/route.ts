import { NextRequest, NextResponse } from "next/server";
import {
  getConversation,
  updateConversation,
  deleteConversation,
  listMessages,
} from "@/server/chat/service";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/chat/conversations/[id]">) {
  const { id } = await ctx.params;
  const conversation = getConversation(id);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ conversation, messages: listMessages(id) });
}

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/chat/conversations/[id]">) {
  const { id } = await ctx.params;
  const patch = await req.json();
  const conversation = updateConversation(id, patch);
  return NextResponse.json({ conversation });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/chat/conversations/[id]">) {
  const { id } = await ctx.params;
  deleteConversation(id);
  return NextResponse.json({ ok: true });
}
