import { NextResponse } from "next/server";
import { getHardware } from "@/server/hardware/scan";

export const runtime = "nodejs";

export async function GET() {
  const hardware = await getHardware(false);
  return NextResponse.json(hardware);
}

export async function POST() {
  const hardware = await getHardware(true);
  return NextResponse.json(hardware);
}
