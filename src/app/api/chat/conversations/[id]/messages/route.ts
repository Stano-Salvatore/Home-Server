import { NextRequest } from "next/server";
import { sendMessage } from "@/server/chat/service";
import { sseResponse } from "@/server/util/sse";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/chat/conversations/[id]/messages">,
) {
  const { id } = await ctx.params;
  const { content } = await req.json();
  if (!content || typeof content !== "string") {
    return new Response(JSON.stringify({ error: "content is required" }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of sendMessage(id, content, req.signal)) {
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
