import { PowerCard } from "@/components/nodes/power-card";

// A page with nothing on it but the power controls, so the dashboard can link
// straight here. Homepage tiles are links, not buttons — they cannot POST — so
// the dashboard sends you to this, and this does the acting. Deliberately
// sparse: it is opened one-handed, on a phone, usually at bedtime.

export const metadata = { title: "Server power" };

export default function PowerPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold text-ink">
        <span className="text-accent">◢</span> server power
      </h1>
      <p className="mb-6 text-sm text-ink-dim">
        Put the machine to bed. Switch the smart plug back on to start it again —
        or send a Wake-on-LAN packet if it is only sleeping.
      </p>

      <PowerCard />

      <p className="mt-6 text-xs text-ink-dim">
        Idle draw is about 91 W, so an evening off is worth roughly €4 a month.
        Hibernate is the one to use before switching the socket off: it costs
        about a watt and comes back in under a minute.
      </p>
    </div>
  );
}
