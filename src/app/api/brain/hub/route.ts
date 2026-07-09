import { NextRequest, NextResponse } from "next/server";
import { getHub, updateHub } from "@/server/brain/hub";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ hub: getHub() });
}

export async function PATCH(req: NextRequest) {
  const patch = await req.json();
  return NextResponse.json({ hub: updateHub(patch) });
}
