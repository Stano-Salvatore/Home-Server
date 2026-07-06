import fs from "node:fs";
import { NextResponse } from "next/server";
import { getFile } from "@/server/files/storage";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]/thumbnail">) {
  const { id } = await ctx.params;
  const file = getFile(id);
  if (!file?.thumbnailPath || !fs.existsSync(file.thumbnailPath)) {
    return NextResponse.json({ error: "No thumbnail" }, { status: 404 });
  }
  const buffer = fs.readFileSync(file.thumbnailPath);
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" },
  });
}
