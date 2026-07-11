import { NextRequest, NextResponse } from "next/server";
import { writeNote, folderForCitation } from "@/server/obsidian/writer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { filename, content, source, citationSourcePaths } = await req.json();
  if (!filename || !content) {
    return NextResponse.json({ error: "filename and content are required" }, { status: 400 });
  }
  try {
    // If this reply cited real vault notes (not Wikipedia/Library/chat
    // memory), file the new note next to the first one — e.g. explaining a
    // term from an Egon Bondy note and saving it lands in the same
    // Books/Egon Bondy folder instead of loose at the vault root.
    let targetFilename = filename;
    if (Array.isArray(citationSourcePaths)) {
      for (const p of citationSourcePaths) {
        const folder = typeof p === "string" ? folderForCitation(p) : null;
        if (folder) {
          targetFilename = `${folder}/${filename}`;
          break;
        }
      }
    }
    const absolutePath = await writeNote({
      filename: targetFilename,
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
