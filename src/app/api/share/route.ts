import { NextRequest, NextResponse } from "next/server";
import { writeNote } from "@/server/obsidian/writer";
import { createTask } from "@/server/tasks/service";
import { litertlmModelId } from "@/server/backends/litertlm";

export const runtime = "nodejs";

function noteFilename(title: string, fallback: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const label = (title || fallback).trim().slice(0, 50) || "shared";
  return `Shared/${stamp} ${label}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";

  if (!title && !text && !url) {
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  }

  if (body.mode === "note") {
    const content = [text, url ? `Source: ${url}` : null].filter(Boolean).join("\n\n") || title;
    try {
      const path = await writeNote({
        filename: noteFilename(title, text || url),
        content,
        frontmatter: {
          created: new Date().toISOString(),
          source: "share_target",
          ...(url ? { url } : {}),
        },
      });
      return NextResponse.json({ ok: true, path });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to save note" },
        { status: 400 },
      );
    }
  }

  if (body.mode === "reminder") {
    const inMinutes = Number(body.inMinutes);
    const minutes = Number.isFinite(inMinutes) && inMinutes > 0 ? Math.round(inMinutes) : 60;
    const runAt = Math.floor(Date.now() / 1000) + minutes * 60;
    const task = createTask({
      name: (title || text || url).slice(0, 60),
      prompt: `Remind the user: ${[title, text, url].filter(Boolean).join(" — ")}`,
      backend: "litertlm",
      modelId: litertlmModelId(),
      triggerType: "once",
      runAt,
      enabled: true,
    });
    return NextResponse.json({ ok: true, task });
  }

  return NextResponse.json({ error: "mode must be 'note' or 'reminder'" }, { status: 400 });
}
