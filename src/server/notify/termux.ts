import { execFile } from "node:child_process";

// Best-effort local Android notification via Termux:API. Fire-and-forget —
// never awaited, never throws into the caller — since this runs on every
// dev machine/sandbox this app is built in too, not just the real S25
// deployment, and the overwhelmingly common case there is simply "not
// installed", not an error worth surfacing.
export function notify(title: string, content: string) {
  execFile("termux-notification", ["--title", title, "--content", content], (err) => {
    if (err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[notify] termux-notification failed:", err.message);
    }
  });
}
