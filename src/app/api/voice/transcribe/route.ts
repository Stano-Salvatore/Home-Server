import { NextRequest, NextResponse } from "next/server";
import { loadSettings } from "@/server/settings/config";
import { execFile } from "node:child_process";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const runtime = "nodejs";

// Browser mic -> text. The browser records whatever MediaRecorder gives it
// (webm/opus in practice); whisper.cpp's server wants 16kHz mono WAV, so the
// clip goes through ffmpeg first. Gated on the whisperUrl setting (empty =
// no STT node available; the mic button surfaces the error rather than
// hiding, so a misconfigured setup is visible instead of silently dead).

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

function ffmpegToWav(src: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      FFMPEG,
      ["-y", "-i", src, "-ar", "16000", "-ac", "1", "-f", "wav", dest],
      { timeout: 30000 },
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

export async function POST(req: NextRequest) {
  const whisperUrl = loadSettings().whisperUrl.trim();
  if (!whisperUrl) {
    return NextResponse.json({ error: "No STT server configured (Settings → whisperUrl)" }, { status: 400 });
  }
  const form = await req.formData();
  const file = form.get("audio");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "No audio received" }, { status: 400 });
  }

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const src = join(tmpdir(), `nedory-mic-${stamp}.webm`);
  const wav = join(tmpdir(), `nedory-mic-${stamp}.wav`);
  try {
    await writeFile(src, Buffer.from(await file.arrayBuffer()));
    await ffmpegToWav(src, wav);

    const body = new FormData();
    body.append("file", new Blob([await readFile(wav)], { type: "audio/wav" }), "audio.wav");
    body.append("response_format", "json");
    const res = await fetch(`${whisperUrl.replace(/\/$/, "")}/inference`, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `STT server: ${res.status}` }, { status: 502 });
    }
    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ text: (data.text ?? "").trim() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  } finally {
    unlink(src).catch(() => {});
    unlink(wav).catch(() => {});
  }
}
