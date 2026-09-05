import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export const runtime = "nodejs";

// What this machine does when nobody is watching.
//
// The background work is real but invisible: startup scripts that bring the
// model server, the transcriber and the reranker up after a reboot, and
// Windows scheduled tasks. Both are discovered rather than configured here,
// so the page cannot drift out of date with the machine.

type Job = {
  name: string;
  kind: "startup" | "scheduled";
  detail: string;
  schedule?: string;
  lastRun?: string;
  status?: string;
};

const STARTUP_DIR = join(
  homedir(),
  "AppData",
  "Roaming",
  "Microsoft",
  "Windows",
  "Start Menu",
  "Programs",
  "Startup",
);

// What each startup script is actually for, in words rather than filenames.
const DESCRIBES: Record<string, string> = {
  "ollama-server": "The model engine every agent talks to",
  "nedory-server": "Nedory itself, on port 3200",
  nedory: "Nedory itself, on port 3200",
  syncthing: "Keeps the Obsidian vault in step with the phone",
  "whisper-server": "Speech to text for the microphone",
  reranker: "Sharpens what the Brain retrieves",
  "fleet-status": "Writes the live status feed Gemmi reads",
  "nedory-backup": "Nightly snapshot of Nedory's database",
  librehardwaremonitor: "Temperature sensors",
};

function run(file: string, args: string[], timeout = 15000): Promise<string> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out) =>
      resolve(err ? "" : String(out)),
    );
  });
}

async function startupJobs(): Promise<Job[]> {
  try {
    const files = await readdir(STARTUP_DIR);
    return files
      .filter((f) => /\.(vbs|lnk|bat|cmd)$/i.test(f) && f.toLowerCase() !== "desktop.ini")
      .map((f) => {
        const stem = f.replace(/\.[^.]+$/, "");
        return {
          name: stem,
          kind: "startup" as const,
          detail: DESCRIBES[stem.toLowerCase()] ?? "Starts with Windows",
          schedule: "at login",
        };
      });
  } catch {
    return [];
  }
}

async function scheduledJobs(): Promise<Job[]> {
  // Only tasks this user created — the full task list is hundreds of Windows
  // internals and would bury the handful that belong to this server.
  const csv = await run("schtasks", ["/query", "/fo", "csv", "/v"], 25000);
  if (!csv) return [];
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(/","/).map((h) => h.replace(/^"|"$/g, "").trim());
  const idx = (label: string) => header.findIndex((h) => h.toLowerCase() === label.toLowerCase());
  const iName = idx("TaskName");
  const iNext = idx("Next Run Time");
  const iLast = idx("Last Run Time");
  const iStatus = idx("Status");
  const iAuthor = idx("Author");

  // Windows ships with well over a hundred tasks, and every vendor adds more
  // (AMD, Gigabyte, Adobe…). Listing them buries the handful that belong to
  // this server, so only tasks this user authored are shown.
  const me = (process.env.USERNAME ?? "").toLowerCase();
  const box = (process.env.COMPUTERNAME ?? "").toLowerCase();
  const mine = (author: string) =>
    Boolean((me && author.includes(me)) || (box && author.includes(box)));

  const jobs: Job[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(/","/).map((c) => c.replace(/^"|"$/g, "").trim());
    const name = cols[iName] ?? "";
    if (!name || name.startsWith("\\Microsoft")) continue;
    // Vendors install into a folder of their own ("\GoogleUserPEH\…"); tasks
    // made for this server sit at the root.
    if (name.replace(/^\\/, "").includes("\\")) continue;
    const author = (cols[iAuthor] ?? "").toLowerCase();
    if (!mine(author)) continue;
    jobs.push({
      name: name.replace(/^\\/, ""),
      kind: "scheduled",
      detail: DESCRIBES[name.replace(/^\\/, "").toLowerCase()] ?? "Windows scheduled task",
      schedule: cols[iNext] && cols[iNext] !== "N/A" ? `next: ${cols[iNext]}` : undefined,
      lastRun: cols[iLast] && cols[iLast] !== "N/A" ? cols[iLast] : undefined,
      status: cols[iStatus] || undefined,
    });
  }
  return jobs;
}

export async function GET() {
  const [startup, scheduled] = await Promise.all([startupJobs(), scheduledJobs()]);
  return NextResponse.json({ jobs: [...startup, ...scheduled] });
}
