import { NextRequest, NextResponse } from "next/server";
import { listDocuments, ingestDocument, deleteDocument } from "@/server/brain/ingest";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ documents: listDocuments() });
}

export async function POST(req: NextRequest) {
  const { title, content } = await req.json();
  if (!title || !content) {
    return NextResponse.json({ error: "title and content are required" }, { status: 400 });
  }
  const sourcePath = `manual/${title}-${Date.now()}`;
  try {
    const { document } = await ingestDocument({ sourceType: "manual", sourcePath, title, content });
    return NextResponse.json({ document });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  deleteDocument(id);
  return NextResponse.json({ ok: true });
}
