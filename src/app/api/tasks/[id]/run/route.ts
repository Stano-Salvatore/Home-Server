import { NextResponse } from "next/server";
import { runTask } from "@/server/tasks/runner";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: RouteContext<"/api/tasks/[id]/run">) {
  const { id } = await ctx.params;
  try {
    const run = await runTask(id, { triggerSource: "manual" });
    return NextResponse.json({ run });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
