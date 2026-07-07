import { ButtonHTMLAttributes } from "react";

type Variant = "default" | "secondary" | "ghost" | "danger";

const VARIANT_CLASSES: Record<Variant, string> = {
  default: "bg-accent hover:bg-accent-hover text-black font-semibold",
  secondary: "border border-[var(--border)] bg-[var(--surface-2)] hover:border-accent/50 text-ink",
  ghost: "bg-transparent hover:bg-[var(--surface-2)] text-ink-dim hover:text-ink",
  danger: "border border-[var(--color-term-red)]/40 bg-[var(--color-term-red)]/10 hover:bg-[var(--color-term-red)]/20 text-[var(--color-term-red)]",
};

export function Button({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
