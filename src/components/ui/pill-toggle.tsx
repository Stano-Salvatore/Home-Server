// The Brain/Wikipedia/Web toggle chips (chat landing, chat header) and the
// Deep Research mode picker are all the same rounded-pill button with an
// accent-colored active state — this was copy-pasted seven times across
// three files before being pulled out here.
export function PillToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active ? "border-accent text-accent" : "text-ink-dim hover:text-ink"
      }`}
      style={{
        borderColor: active ? undefined : "var(--border)",
        background: active ? "rgba(224, 108, 117, 0.10)" : undefined,
      }}
    >
      {children}
    </button>
  );
}
