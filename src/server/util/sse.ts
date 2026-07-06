export function sseFromAsyncIterable(
  iterable: AsyncIterable<string>,
  opts?: { onDone?: (full: string) => void; onError?: (err: unknown) => void },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let full = "";
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of iterable) {
          full += chunk;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        opts?.onDone?.(full);
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: err instanceof Error ? err.message : String(err) })}\n\n`,
          ),
        );
        opts?.onError?.(err);
      } finally {
        controller.close();
      }
    },
  });
}

export function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
