import type { Severity } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SEVERITY_CLASS: Record<Severity, string> = {
  critical: "border-transparent bg-red-700 text-white",
  high: "border-transparent bg-orange-600 text-white",
  medium: "border-transparent bg-amber-500 text-black",
  low: "border-transparent bg-sky-600 text-white",
  info: "border-transparent bg-slate-500 text-white",
  unknown: "border-border bg-muted text-muted-foreground",
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-md font-mono text-[11px] uppercase tracking-wide",
        SEVERITY_CLASS[severity],
        className,
      )}
    >
      {severity}
    </Badge>
  );
}
