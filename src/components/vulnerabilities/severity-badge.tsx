import type { Severity } from "@/lib/domain/severity";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const SEVERITY_CLASS: Record<Severity, string> = {
  critical: "border-transparent bg-red-700 text-white",
  high: "border-transparent bg-orange-600 text-white",
  medium: "border-transparent bg-amber-500 text-black",
  low: "border-transparent bg-sky-600 text-white",
  none: "border-transparent bg-zinc-400 text-white",
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity | null | undefined;
  className?: string;
}) {
  if (!severity) {
    return (
      <Badge variant="outline" className={cn("font-mono text-[10px]", className)}>
        —
      </Badge>
    );
  }
  return (
    <Badge
      className={cn(
        "font-mono text-[10px] uppercase tracking-wide",
        SEVERITY_CLASS[severity],
        className,
      )}
    >
      {severity}
    </Badge>
  );
}
