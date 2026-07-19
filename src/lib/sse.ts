// Shared client-side SSE framing: every one of Nedory's own streaming
// endpoints (chat, council, model pulls) writes `data: <json>\n\n` events
// with no [DONE] sentinel — the stream just ends. Three call sites had this
// exact fetch/reader/decode/buffer loop copy-pasted, differing only in what
// they did with each parsed event; this pulls out the framing so each caller
// is left with just its own event-shape handling.
export async function* readSSE(res: Response): AsyncGenerator<unknown> {
  if (!res.body) throw new Error("No response stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const evt of events) {
      const line = evt.replace(/^data:\s*/, "").trim();
      if (!line) continue;
      yield JSON.parse(line);
    }
  }
}
