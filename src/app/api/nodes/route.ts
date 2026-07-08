import { NextRequest, NextResponse } from "next/server";
import { listNodes, addNode, updateNode, deleteNode } from "@/server/nodes/nodes";
import { probeNodes } from "@/server/backends/registry";
import { listServers } from "@/server/backends/llamacpp";
import { loadSettings } from "@/server/settings/config";

export const runtime = "nodejs";

type Service = { name: string; kind: string; url: string; online: boolean };

async function ping(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

// Non-inference boxes in the cluster (Kiwix / Qdrant), derived from settings so
// they show up alongside the Ollama nodes for a full picture of what's up.
async function probeServices(): Promise<Service[]> {
  const s = loadSettings();
  const services: { name: string; kind: string; url: string; check: string }[] = [];

  s.kiwixUrl
    .split(",")
    .map((u) => u.trim().replace(/\/$/, ""))
    .filter(Boolean)
    .forEach((url, i, arr) => {
      services.push({
        name: arr.length > 1 ? `Kiwix ${i + 1}` : "Kiwix",
        kind: "offline Wikipedia",
        url,
        check: `${url}/catalog/v2/entries`,
      });
    });

  if (s.qdrantUrl.trim()) {
    const url = s.qdrantUrl.trim().replace(/\/$/, "");
    services.push({ name: "Qdrant", kind: "vector store", url, check: `${url}/healthz` });
  }

  return Promise.all(
    services.map(async (svc) => ({
      name: svc.name,
      kind: svc.kind,
      url: svc.url,
      online: await ping(svc.check),
    })),
  );
}

export async function GET() {
  const [statuses, llamacppServers, services] = await Promise.all([
    probeNodes(),
    listServers(),
    probeServices(),
  ]);
  return NextResponse.json({ nodes: statuses, llamacppServers, services });
}

export async function POST(req: NextRequest) {
  const { name, url } = await req.json();
  if (!name || !url) {
    return NextResponse.json({ error: "name and url are required" }, { status: 400 });
  }
  const node = addNode(name, url);
  return NextResponse.json({ node });
}

export async function PUT(req: NextRequest) {
  const { id, name, url } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const node = updateNode(id, { name, url });
  return NextResponse.json({ node });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const nodes = listNodes();
  if (nodes.length <= 1) {
    return NextResponse.json({ error: "Can't remove the last node" }, { status: 400 });
  }
  deleteNode(id);
  return NextResponse.json({ ok: true });
}
