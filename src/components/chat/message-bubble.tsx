import type { ChatUIMessage } from "@/lib/useChatStream";

export function MessageBubble({ message }: { message: ChatUIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-2xl rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${
          isUser ? "bg-indigo-600 text-white" : "bg-neutral-900 text-neutral-100 border border-neutral-800"
        }`}
      >
        {message.content || (isUser ? "" : "…")}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 pt-2 border-t border-neutral-800 flex flex-col gap-1">
            {message.citations.map((c, i) => (
              <div key={c.documentId + i} className="text-xs text-neutral-500">
                [{i + 1}] {c.title} — <span className="italic">{c.snippet}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
