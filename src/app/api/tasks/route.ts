import { NextRequest, NextResponse } from "next/server";
import { listTasks, createTask } from "@/server/tasks/service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ tasks: listTasks() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, prompt, backend, modelId, triggerType } = body;
  if (!name || !prompt || !backend || !modelId || !triggerType) {
    return NextResponse.json(
      { error: "name, prompt, backend, modelId, and triggerType are required" },
      { status: 400 },
    );
  }
  const task = createTask(body);
  return NextResponse.json({ task });
}
