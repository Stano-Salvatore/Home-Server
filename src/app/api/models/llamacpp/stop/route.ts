import { NextRequest, NextResponse } from "next/server";
import { stopServer } from "@/server/backends/llamacpp";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    await stopServer(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
