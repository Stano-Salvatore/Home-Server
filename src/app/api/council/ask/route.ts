import { NextRequest } from "next/server";
import { askOneShot } from "@/server/council/service";
import { sseResponse } from "@/server/util/sse";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { backend, modelId, prompt } = body;
  if (!backend || !modelId || !prompt) {
    return new Response(JSON.stringify({ error: "backend, modelId and prompt are required" }), {
      status: 400,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of askOneShot(body, req.signal)) {
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
