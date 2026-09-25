import { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function Input({ label, className = "", id, ...props }: Props) {
  const inputId = id || props.name || label;
  return (
    <label className="block space-y-1.5" htmlFor={inputId}>
      {label ? <span className="text-sm text-muted">{label}</span> : null}
      <input id={inputId} className={`vbx-field ${className}`} {...props} />
    </label>
  );
}
