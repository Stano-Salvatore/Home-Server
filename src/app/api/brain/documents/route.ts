import { NextRequest, NextResponse } from "next/server";
import { listDocuments, ingestDocument, deleteDocument } from "@/server/brain/ingest";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ documents: listDocuments() });
}

export async function POST(req: NextRequest) {
  const { title, content, sourcePath: given } = await req.json();
  if (!title || !content) {
    return NextResponse.json({ error: "title and content are required" }, { status: 400 });
  }
  // A caller with a stable identifier gets an idempotent ingest: ingestDocument
  // keys on sourcePath, so re-sending the same document updates it instead of
  // adding another copy. Without this a bulk import run twice silently doubles
  // the Brain — which is exactly what happened importing a Wikipedia corpus.
  // The timestamped fallback stays for callers with nothing stable to offer,
  // such as a note typed into the UI.
  const sourcePath =
    typeof given === "string" && given.trim() ? given.trim() : `manual/${title}-${Date.now()}`;
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
  await deleteDocument(id);
  return NextResponse.json({ ok: true });
}
