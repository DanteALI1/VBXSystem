import { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "ok" | "warn" | "danger" | "accent";
};

export function Badge({ tone = "neutral", className = "", ...props }: Props) {
  const tones = {
    neutral: "bg-surface2 text-muted border-border",
    ok: "bg-ok/15 text-ok border-ok/30",
    warn: "bg-warn/15 text-warn border-warn/30",
    danger: "bg-danger/15 text-danger border-danger/30",
    accent: "bg-accent/15 text-accent2 border-accent/30",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${tones} ${className}`}
      {...props}
    />
  );
}
