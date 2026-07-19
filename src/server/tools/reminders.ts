import { createTask } from "@/server/tasks/service";
import { litertlmModelId } from "@/server/backends/litertlm";
import type { BuiltinTool } from "./types";

// A small model doing tool-call planning shouldn't be trusted to do clock
// arithmetic itself ("6pm" minus "whatever it thinks now is") — that math
// happens here in code instead. The tool just gives it two simple ways to
// express intent: a relative offset, or a plain HH:MM it doesn't need to
// convert.
function nextOccurrence(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  const now = new Date();
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 1);
  return Math.floor(candidate.getTime() / 1000);
}

export const REMINDER_TOOLS: BuiltinTool[] = [
  {
    name: "create_reminder",
    description:
      "Create a one-time reminder that fires later and sends an Android notification. Use " +
      '`in_minutes` for a relative time ("remind me in 10 minutes" -> in_minutes: 10), or ' +
      '`at_time` (24-hour "HH:MM", e.g. "18:00" for 6pm) for a specific time today (tomorrow ' +
      "if that time already passed today). `text` is what to be reminded of.",
    call: async (args) => {
      const text = typeof args.text === "string" ? args.text.trim() : "";
      if (!text) return "Missing reminder text.";

      let runAt: number | null = null;
      if (typeof args.at_time === "string") runAt = nextOccurrence(args.at_time);
      if (runAt === null && typeof args.in_minutes === "number" && Number.isFinite(args.in_minutes)) {
        runAt = Math.floor(Date.now() / 1000) + Math.max(1, Math.round(args.in_minutes)) * 60;
      }
      // Neither arg parsed to something usable — still create the reminder
      // (an hour out) rather than silently doing nothing because a small
      // model's args didn't quite match the expected shape.
      if (runAt === null) runAt = Math.floor(Date.now() / 1000) + 60 * 60;

      createTask({
        name: text.slice(0, 60),
        prompt: `Remind the user: ${text}`,
        backend: "litertlm",
        modelId: litertlmModelId(),
        triggerType: "once",
        runAt,
        enabled: true,
      });

      return `Reminder set for ${new Date(runAt * 1000).toLocaleString()}: "${text}"`;
    },
  },
];
