import { NextRequest } from "next/server";
import { pullModel } from "@/server/backends/ollama";
import { resolveHost } from "@/server/nodes/nodes";
import { sseResponse } from "@/server/util/sse";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { tag, nodeId } = await req.json();
  if (!tag || typeof tag !== "string") {
    return new Response(JSON.stringify({ error: "tag is required" }), { status: 400 });
  }

  const host = resolveHost(nodeId);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const progress of pullModel(tag, host)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: err instanceof Error ? err.message : String(err), done: true })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return sseResponse(stream);
}
