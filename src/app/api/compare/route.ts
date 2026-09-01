import { NextRequest, NextResponse } from "next/server";
import { backendFor } from "@/server/backends/registry";
import { readJsonBlob, writeJsonBlob } from "@/server/settings/jsonBlob";
import type { BackendKind } from "@/server/backends/types";

export const runtime = "nodejs";

// Blind model A/B: run the same prompt on two targets in parallel and return
// both answers. The caller shuffles which answer renders on which side, so
// the vote is genuinely blind; this route neither knows nor cares about the
// display order. Verdicts land in the compare_votes blob via POST /votes.

type CompareBody = {
  prompt: string;
  a: { backend: BackendKind; modelId: string };
  b: { backend: BackendKind; modelId: string };
};

const VOTES_KEY = "compare_votes";

export type CompareVote = {
  at: number;
  prompt: string;
  winner: string; // modelId, or "tie" / "both-bad"
  loser: string;
  a: string;
  b: string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as CompareBody;
  if (!body?.prompt?.trim() || !body.a?.modelId || !body.b?.modelId) {
    return NextResponse.json({ error: "prompt, a and b are required" }, { status: 400 });
  }
  const messages = [{ role: "user" as const, content: body.prompt }];
  const run = async (t: { backend: BackendKind; modelId: string }) => {
    const started = Date.now();
    const text = await backendFor(t.backend).chatComplete(t.modelId, messages);
    return { text, ms: Date.now() - started };
  };
  try {
    const [a, b] = await Promise.all([run(body.a), run(body.b)]);
    return NextResponse.json({ a, b });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

export async function GET() {
  const votes = readJsonBlob<CompareVote[]>(VOTES_KEY, [], (v): v is CompareVote[] => Array.isArray(v));
  // scoreboard: wins per modelId (ties/both-bad excluded from win counts)
  const wins = new Map<string, { wins: number; losses: number }>();
  for (const v of votes) {
    if (v.winner === "tie" || v.winner === "both-bad") continue;
    const w = wins.get(v.winner) ?? { wins: 0, losses: 0 };
    w.wins++;
    wins.set(v.winner, w);
    const l = wins.get(v.loser) ?? { wins: 0, losses: 0 };
    l.losses++;
    wins.set(v.loser, l);
  }
  return NextResponse.json({
    votes: votes.slice(-50).reverse(),
    scoreboard: [...wins.entries()]
      .map(([modelId, s]) => ({ modelId, ...s }))
      .sort((x, y) => y.wins - x.wins),
  });
}

export async function PUT(req: NextRequest) {
  const vote = (await req.json()) as CompareVote;
  if (!vote?.winner || !vote?.a || !vote?.b) {
    return NextResponse.json({ error: "winner, a and b are required" }, { status: 400 });
  }
  const votes = readJsonBlob<CompareVote[]>(VOTES_KEY, [], (v): v is CompareVote[] => Array.isArray(v));
  votes.push({ ...vote, at: Date.now() });
  writeJsonBlob(VOTES_KEY, votes);
  return NextResponse.json({ ok: true, total: votes.length });
}
