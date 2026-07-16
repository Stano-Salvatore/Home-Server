import { NextRequest, NextResponse } from "next/server";
import { getRun, deleteRun, cancelRun } from "@/server/research/service";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/research/[id]">) {
  const { id } = await ctx.params;
  const run = getRun(id);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ run });
}

// Cancel: a running job can't be deleted out from under itself, so PATCH
// flips it to cancelled and the pipeline exits at its next checkpoint.
export async function PATCH(_req: NextRequest, ctx: RouteContext<"/api/research/[id]">) {
  const { id } = await ctx.params;
  cancelRun(id);
  return NextResponse.json({ run: getRun(id) });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/research/[id]">) {
  const { id } = await ctx.params;
  await deleteRun(id);
  return NextResponse.json({ ok: true });
}
