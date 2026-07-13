// Turn a raw stream/backend error into something a person can act on. Falls
// back to the original text for anything we don't recognise, so nothing is
// hidden — it's just made friendlier when we can.
export function friendlyError(raw: string): string {
  const e = (raw || "").toLowerCase();
  if (!raw) return "Something went wrong.";

  if (
    e.includes("fetch failed") ||
    e.includes("econnrefused") ||
    e.includes("failed to fetch") ||
    e.includes("network") ||
    e.includes("timed out") ||
    e.includes("timeout")
  ) {
    return "Can't reach the model host. Is that node awake and reachable (Tailscale/local network)? Check the status dot in the sidebar, and confirm the node's URL under Nodes.";
  }
  if (e.includes("embeddings failed")) {
    return "The embedding model isn't available on the embedding host. Pull it there (e.g. `ollama pull bge-m3`), then try again.";
  }
  if ((e.includes("model") && e.includes("not found")) || e.includes(" 404")) {
    return "That model isn't pulled on the node. Run `ollama pull <model>` on the compute phone, then retry.";
  }
  if (e.includes("chat failed: 5") || e.includes(" 500")) {
    return "The model host errored mid-reply — it may be low on memory. Try a smaller model, or restart Ollama on the node.";
  }
  return raw;
}
