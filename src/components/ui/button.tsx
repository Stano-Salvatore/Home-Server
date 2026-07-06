import { ButtonHTMLAttributes } from "react";

type Variant = "default" | "secondary" | "ghost" | "danger";

const VARIANT_CLASSES: Record<Variant, string> = {
  default: "bg-indigo-600 hover:bg-indigo-500 text-white",
  secondary: "bg-neutral-800 hover:bg-neutral-700 text-neutral-100",
  ghost: "bg-transparent hover:bg-neutral-800 text-neutral-300",
  danger: "bg-red-900/60 hover:bg-red-900 text-red-100",
};

export function Button({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
