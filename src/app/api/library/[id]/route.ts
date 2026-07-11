import { NextRequest, NextResponse } from "next/server";
import { getBook, updateBook } from "@/server/library/scanner";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/library/[id]">) {
  const { id } = await ctx.params;
  if (!getBook(id)) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const { title, author } = await req.json();
  const book = updateBook(id, { title, author });
  return NextResponse.json({ book });
}
