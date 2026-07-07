import fs from "node:fs";
import { NextResponse } from "next/server";
import { getBook } from "@/server/library/scanner";

export const runtime = "nodejs";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export async function GET(_req: Request, ctx: RouteContext<"/api/library/[id]/cover">) {
  const { id } = await ctx.params;
  const book = getBook(id);
  if (!book || !book.coverPath || !fs.existsSync(book.coverPath)) {
    return NextResponse.json({ error: "Cover not found" }, { status: 404 });
  }
  const buffer = fs.readFileSync(book.coverPath);
  const ext = book.coverPath.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream";
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" },
  });
}
