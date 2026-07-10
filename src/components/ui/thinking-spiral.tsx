// A single spiral that slowly rotates — a subtle "wind" while the model thinks,
// in place of the usual three dots. The path is an Archimedean spiral computed
// once; the whole glyph spins via CSS (calmed by prefers-reduced-motion).
const SPIRAL = (() => {
  const cx = 12;
  const cy = 12;
  const turns = 2.6;
  const steps = 64;
  const maxR = 8.5;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const t = f * turns * Math.PI * 2;
    const r = f * maxR;
    const x = cx + r * Math.cos(t);
    const y = cy + r * Math.sin(t);
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return "M" + pts.join(" L");
})();

export function ThinkingSpiral({ size = 15, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`thinking-spin ${className}`}
      role="img"
      aria-label="thinking"
    >
      <path
        d={SPIRAL}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
