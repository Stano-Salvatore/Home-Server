export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type RunningModel = {
  id: string; // backend-specific identifier used to target chat/embed calls
  backend: "ollama" | "llamacpp";
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

export interface ModelBackend {
  kind: "ollama" | "llamacpp";
  listRunning(): Promise<RunningModel[]>;
  chatStream(target: string, messages: ChatMessage[]): AsyncIterable<string>;
  chatComplete(target: string, messages: ChatMessage[]): Promise<string>;
}
