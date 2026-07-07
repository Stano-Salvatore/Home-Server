import { NextRequest, NextResponse } from "next/server";
import { listProjects, createProject } from "@/server/projects/projects";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ projects: listProjects() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name : "";
  if (!name.trim()) {
    return NextResponse.json({ error: "A project name is required" }, { status: 400 });
  }
  const project = createProject({
    name,
    emoji: body.emoji,
    instructions: body.instructions,
  });
  return NextResponse.json({ project });
}
