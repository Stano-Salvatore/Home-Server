import { NextResponse } from "next/server";
import { getHardware } from "@/server/hardware/scan";
import { scoreCatalog } from "@/server/catalog/fitScore";

export const runtime = "nodejs";

export async function GET() {
  const hardware = await getHardware(false);
  const scored = scoreCatalog(hardware);
  return NextResponse.json({ hardware, models: scored });
}
