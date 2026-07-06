import { spawn, execFile } from "node:child_process";
import net from "node:net";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { llamacppServers } from "@/server/db/schema";
import { loadSettings } from "@/server/settings/config";
import { newId } from "@/server/util/hash";
import type { ChatMessage, ModelBackend, RunningModel } from "./types";

const PORT_RANGE_START = 8081;
const PORT_RANGE_END = 8199;

async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once("error", () => resolve(false))
      .once("listening", () => tester.close(() => resolve(true)))
      .listen(port, "127.0.0.1");
  });
}

async function allocatePort(): Promise<number> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error("No free port available for llama.cpp server");
}

async function waitForHealth(port: number, timeoutMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export type LlamaCppServerRow = typeof llamacppServers.$inferSelect;

export async function listServers(): Promise<LlamaCppServerRow[]> {
  return db.select().from(llamacppServers).all();
}

export async function startServer(opts: {
  name: string;
  modelPath: string;
  extraArgs?: string;
  useTmux?: boolean;
}): Promise<LlamaCppServerRow> {
  const settings = loadSettings();
  const port = await allocatePort();
  const id = newId("llamacpp");
  const extraArgsList = opts.extraArgs ? opts.extraArgs.split(/\s+/).filter(Boolean) : [];
  const args = ["-m", opts.modelPath, "--port", String(port), "--host", "127.0.0.1", ...extraArgsList];

  let pid: number | undefined;
  let tmuxSession: string | null = null;

  if (opts.useTmux) {
    tmuxSession = `llamacpp-${id}`;
    const cmd = [settings.llamaCppBinPath, ...args].map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
    await new Promise<void>((resolve, reject) => {
      execFile("tmux", ["new-session", "-d", "-s", tmuxSession as string, cmd], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } else {
    const child = spawn(settings.llamaCppBinPath, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    pid = child.pid;
  }

  const healthy = await waitForHealth(port);

  const row: typeof llamacppServers.$inferInsert = {
    id,
    name: opts.name,
    modelPath: opts.modelPath,
    port,
    extraArgs: opts.extraArgs ?? null,
    tmuxSession,
    status: healthy ? "running" : "stopped",
    pid: pid ?? null,
    lastStartedAt: Date.now(),
  };
  db.insert(llamacppServers).values(row).run();

  if (!healthy) {
    throw new Error(
      `llama.cpp server did not become healthy within 30s on port ${port}. Check that '${settings.llamaCppBinPath}' and the model path are correct.`,
    );
  }

  return db.select().from(llamacppServers).where(eq(llamacppServers.id, id)).get()!;
}

export async function stopServer(id: string): Promise<void> {
  const server = db.select().from(llamacppServers).where(eq(llamacppServers.id, id)).get();
  if (!server) throw new Error("Server not found");

  if (server.tmuxSession) {
    await new Promise<void>((resolve) => {
      execFile("tmux", ["kill-session", "-t", server.tmuxSession as string], () => resolve());
    });
  } else if (server.pid) {
    try {
      process.kill(server.pid, "SIGTERM");
    } catch {
      // already dead
    }
  }

  db.update(llamacppServers).set({ status: "stopped", pid: null }).where(eq(llamacppServers.id, id)).run();
}

export async function recoverRunningServers() {
  const running = db
    .select()
    .from(llamacppServers)
    .where(eq(llamacppServers.status, "running"))
    .all();

  for (const server of running) {
    const alive = await waitForHealth(server.port, 1000);
    if (!alive) {
      db.update(llamacppServers)
        .set({ status: "stopped", pid: null })
        .where(eq(llamacppServers.id, server.id))
        .run();
    }
  }
}

async function* streamChat(
  target: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncIterable<string> {
  const server = db.select().from(llamacppServers).where(eq(llamacppServers.id, target)).get();
  if (!server) throw new Error("llama.cpp server not found");

  const res = await fetch(`http://127.0.0.1:${server.port}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`llama.cpp chat failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      const parsed = JSON.parse(payload);
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) yield delta as string;
    }
  }
}

export const llamaCppBackend: ModelBackend = {
  kind: "llamacpp",
  async listRunning(): Promise<RunningModel[]> {
    const rows = db.select().from(llamacppServers).where(eq(llamacppServers.status, "running")).all();
    return rows.map((r) => ({
      id: r.id,
      backend: "llamacpp" as const,
      label: r.name,
      port: r.port,
    }));
  },
  chatStream(target, messages, signal) {
    return streamChat(target, messages, signal);
  },
  async chatComplete(target, messages) {
    let full = "";
    for await (const chunk of streamChat(target, messages)) full += chunk;
    return full;
  },
};
