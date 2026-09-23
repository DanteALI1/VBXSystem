import { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ variant = "primary", className = "", ...props }: Props) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50";
  const styles = {
    primary: "bg-accent text-white hover:bg-accent2 shadow-soft",
    secondary:
      "border border-border bg-surface2 text-text hover:border-accent/40 hover:bg-surface",
    ghost: "text-muted hover:text-text hover:bg-surface2",
  }[variant];

  return <button className={`${base} ${styles} ${className}`} {...props} />;
}
