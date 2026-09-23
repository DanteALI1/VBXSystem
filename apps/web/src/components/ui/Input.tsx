import { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function Input({ label, className = "", id, ...props }: Props) {
  const inputId = id || props.name || label;
  return (
    <label className="block space-y-1.5" htmlFor={inputId}>
      <span className="text-sm text-muted">{label}</span>
      <input
        id={inputId}
        className={`w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm text-text placeholder:text-muted/70 outline-none transition focus:border-accent ${className}`}
        {...props}
      />
    </label>
  );
}
