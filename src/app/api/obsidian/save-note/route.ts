import { NextRequest, NextResponse } from "next/server";
import { writeNote } from "@/server/obsidian/writer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { filename, content, source } = await req.json();
  if (!filename || !content) {
    return NextResponse.json({ error: "filename and content are required" }, { status: 400 });
  }
  try {
    const absolutePath = await writeNote({
      filename,
      content,
      frontmatter: { created: new Date().toISOString(), source: source ?? "chat" },
    });
    return NextResponse.json({ path: absolutePath });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
