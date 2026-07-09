import { NextRequest, NextResponse } from "next/server";
import { listCustomLinks, addCustomLink, deleteCustomLink } from "@/server/brain/customLinks";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ links: listCustomLinks() });
}

export async function POST(req: NextRequest) {
  const { a, b } = await req.json();
  const link = addCustomLink(a, b);
  if (!link) return NextResponse.json({ error: "Invalid or duplicate link" }, { status: 400 });
  return NextResponse.json({ link });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  deleteCustomLink(id);
  return NextResponse.json({ ok: true });
}
