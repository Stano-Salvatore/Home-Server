import { NextRequest, NextResponse } from "next/server";
import { getTask, updateTask, deleteTask } from "@/server/tasks/service";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params;
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ task });
}

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params;
  const patch = await req.json();
  const task = updateTask(id, patch);
  return NextResponse.json({ task });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params;
  deleteTask(id);
  return NextResponse.json({ ok: true });
}
