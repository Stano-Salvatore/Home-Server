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
      className={`rounded-lg border border-neutral-800 bg-neutral-900/60 ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
