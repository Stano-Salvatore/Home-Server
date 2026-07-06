const COLORS = {
  green: "bg-green-500/15 text-green-400 border-green-500/30",
  blue: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  yellow: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  red: "bg-red-500/15 text-red-400 border-red-500/30",
  neutral: "bg-neutral-700/40 text-neutral-300 border-neutral-600/50",
} as const;

export function Badge({
  color = "neutral",
  children,
}: {
  color?: keyof typeof COLORS;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${COLORS[color]}`}
    >
      {children}
    </span>
  );
}
