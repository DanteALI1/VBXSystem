import { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface/90 p-5 shadow-soft backdrop-blur ${className}`}
      {...props}
    />
  );
}
