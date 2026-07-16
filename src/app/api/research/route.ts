import { NextRequest, NextResponse } from "next/server";
import { listRuns, startResearch, type ResearchMode } from "@/server/research/service";

export const runtime = "nodejs";

const MODES = new Set(["auto", "product", "compare", "howto", "factcheck"]);

export async function GET() {
  return NextResponse.json({ runs: listRuns() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, mode, backend, modelId, rounds } = body;
  if (!prompt || typeof prompt !== "string" || !backend || !modelId) {
    return NextResponse.json({ error: "prompt, backend and modelId are required" }, { status: 400 });
  }
  const run = startResearch({
    prompt: prompt.trim(),
    mode: (MODES.has(mode) ? mode : "auto") as ResearchMode,
    backend,
    modelId,
    rounds: Number.isFinite(rounds) ? Number(rounds) : 2,
  });
  return NextResponse.json({ run });
}
