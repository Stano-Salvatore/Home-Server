import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";

export const runtime = "nodejs";

// Power control for the machine Nedory itself runs on, so the server can be
// put to bed from a phone rather than from its own keyboard.
//
// Every action stops the containers first. Immich's Postgres holds tens of
// thousands of photo records and deserves a graceful stop even when the
// machine is only going to sleep — a suspended database that later resumes
// against a changed clock is a class of bug worth never meeting.
//
// Reachable only over the tailnet, like the rest of Nedory. It should gain a
// password along with the dashboard (roadmap O·3); until then the network is
// the boundary, and this route deliberately requires an explicit confirm
// field so a stray GET or a curious crawler can never black out the house.

type Action = "sleep" | "hibernate" | "shutdown";

const COMMANDS: Record<Action, { file: string; args: string[]; label: string }> = {
  // rundll32 is the only reliable way to reach true S3 on Windows; powercfg's
  // hibernate-off state is what keeps it from silently hibernating instead.
  sleep: { file: "rundll32.exe", args: ["powrprof.dll,SetSuspendState", "0,1,0"], label: "sleeping" },
  hibernate: { file: "shutdown.exe", args: ["/h"], label: "hibernating" },
  shutdown: { file: "shutdown.exe", args: ["/s", "/t", "20", "/c", "Shut down from Nedory"], label: "shutting down" },
};

function run(file: string, args: string[], timeout = 90_000): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true }, (err) => (err ? reject(err) : resolve()));
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { action?: Action; confirm?: boolean };
  const action = body.action;
  if (!action || !(action in COMMANDS)) {
    return NextResponse.json({ error: "action must be sleep, hibernate or shutdown" }, { status: 400 });
  }
  if (body.confirm !== true) {
    return NextResponse.json({ error: "confirm must be true" }, { status: 400 });
  }

  const stopped: string[] = [];
  try {
    // Graceful container stop, 60s of grace, Postgres included.
    const names = await new Promise<string[]>((resolve) => {
      execFile("docker", ["ps", "--format", "{{.Names}}"], { timeout: 20_000, windowsHide: true }, (err, out) => {
        resolve(err ? [] : String(out).split(/\r?\n/).filter(Boolean));
      });
    });
    if (names.length) {
      await run("docker", ["stop", "--time", "60", ...names], 120_000).catch(() => {});
      stopped.push(...names);
    }
  } catch {
    // A container that will not stop is not a reason to leave the machine on;
    // the power action still runs, and Windows stops the rest on its way down.
  }

  const cmd = COMMANDS[action];
  try {
    await run(cmd.file, cmd.args);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), stopped },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, action, state: cmd.label, stopped });
}
