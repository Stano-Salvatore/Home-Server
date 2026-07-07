export function Card({
  className = "",
  children,
  onClick,
}: {
  className?: string;
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={`rounded-lg border ${className}`}
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
