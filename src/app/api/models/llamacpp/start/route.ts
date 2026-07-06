import { NextRequest, NextResponse } from "next/server";
import { startServer } from "@/server/backends/llamacpp";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, modelPath, extraArgs, useTmux } = body;

  if (!name || !modelPath) {
    return NextResponse.json({ error: "name and modelPath are required" }, { status: 400 });
  }

  try {
    const server = await startServer({ name, modelPath, extraArgs, useTmux });
    return NextResponse.json({ server });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
