import { NextRequest, NextResponse } from "next/server";
import { listMemoryFacts, createMemoryFact, updateMemoryFact, deleteMemoryFact } from "@/server/brain/memory";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ facts: listMemoryFacts() });
}

export async function POST(req: NextRequest) {
  const { content, category } = await req.json();
  if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });
  const fact = createMemoryFact({ content, category });
  return NextResponse.json({ fact });
}

export async function PATCH(req: NextRequest) {
  const { id, content, category } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const fact = updateMemoryFact(id, { content, category });
  return NextResponse.json({ fact });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  deleteMemoryFact(id);
  return NextResponse.json({ ok: true });
}
