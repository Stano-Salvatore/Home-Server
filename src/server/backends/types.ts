// Canonical backend-kind union — import this rather than repeating the
// "ollama" | "llamacpp" | "litertlm" literal. Several server modules had a
// stale "ollama" | "llamacpp" copy (predating the litertlm backend) that
// only compiled because the value crosses an API/DB string boundary at
// runtime; it hid the fact that those signatures were lying about what
// they actually accept.
export type BackendKind = "ollama" | "llamacpp" | "litertlm";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type RunningModel = {
  id: string; // backend-specific identifier used to target chat/embed calls
  backend: BackendKind;
  label: string;
  contextLength?: number;
  port?: number;
};

export type PullProgressEvent = {
  status: string;
  completed?: number;
  total?: number;
  done: boolean;
};

// Most yields carry only `text`. A backend that reports an exact generated
// token count (Ollama's `eval_count`, llama.cpp's streamed `usage`) attaches
// `tokenCount` to its final yield so callers don't have to estimate it.
export type ChatStreamChunk = { text: string; tokenCount?: number };

export interface ModelBackend {
  kind: BackendKind;
  listRunning(): Promise<RunningModel[]>;
  chatStream(
    target: string,
    messages: ChatMessage[],
    signal?: AbortSignal,
  ): AsyncIterable<ChatStreamChunk>;
  chatComplete(target: string, messages: ChatMessage[]): Promise<string>;
}
