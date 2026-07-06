import { NextResponse } from "next/server";
import { listTaskRuns } from "@/server/tasks/service";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/tasks/[id]/runs">) {
  const { id } = await ctx.params;
  return NextResponse.json({ runs: listTaskRuns(id) });
}
