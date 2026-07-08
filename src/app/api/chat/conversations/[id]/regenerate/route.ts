import { NextRequest } from "next/server";
import { regenerateLast } from "@/server/chat/service";
import { sseResponse } from "@/server/util/sse";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of regenerateLast(id, req.signal)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
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
