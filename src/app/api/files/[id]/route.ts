import { NextResponse } from "next/server";
import { deleteFile, getFile } from "@/server/files/storage";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  if (!getFile(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  deleteFile(id);
  return NextResponse.json({ ok: true });
}
