export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border border-neutral-800 bg-neutral-900/60 ${className}`}
    >
      {children}
    </div>
  );
}
