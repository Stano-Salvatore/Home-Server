import { NextRequest, NextResponse } from "next/server";
import { listConversations, createConversation } from "@/server/chat/service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ conversations: listConversations() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { backend, modelId, title, systemPrompt, ragEnabled } = body;
  if (!backend || !modelId) {
    return NextResponse.json({ error: "backend and modelId are required" }, { status: 400 });
  }
  const conversation = createConversation({ backend, modelId, title, systemPrompt, ragEnabled });
  return NextResponse.json({ conversation });
}
