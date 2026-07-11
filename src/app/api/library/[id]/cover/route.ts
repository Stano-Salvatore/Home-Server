import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { getBook, setBookCover } from "@/server/library/scanner";
import { saveCover } from "@/server/library/covers";

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

export async function POST(req: NextRequest, ctx: RouteContext<"/api/library/[id]/cover">) {
  const { id } = await ctx.params;
  const book = getBook(id);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("cover");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "cover file is required" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "cover must be an image" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const newPath = await saveCover(id, { data: buffer, mimeType: file.type }, book.title, book.author);

  // The new cover may land at a different extension than the old one
  // (placeholder .svg -> uploaded .jpg) — clean up the orphaned file.
  if (book.coverPath && book.coverPath !== newPath && fs.existsSync(book.coverPath)) {
    fs.unlinkSync(book.coverPath);
  }

  setBookCover(id, newPath);
  return NextResponse.json({ ok: true });
}
