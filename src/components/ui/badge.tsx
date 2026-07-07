const COLORS = {
  green: "text-[var(--color-term-green)] border-[var(--color-term-green)]/30 bg-[var(--color-term-green)]/10",
  blue: "text-[#9cdef2] border-[#9cdef2]/30 bg-[#9cdef2]/10",
  yellow: "text-[var(--color-term-gold)] border-[var(--color-term-gold)]/30 bg-[var(--color-term-gold)]/10",
  red: "text-[var(--color-term-red)] border-[var(--color-term-red)]/30 bg-[var(--color-term-red)]/10",
  neutral: "text-ink-dim border-[var(--border)] bg-[var(--surface-2)]",
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
