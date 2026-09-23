import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function SourceBadges({
  sources,
  className,
}: {
  sources: ("nvd" | "bdu" | string)[];
  className?: string;
}) {
  const set = new Set(sources.map((s) => s.toLowerCase()));
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {set.has("nvd") && (
        <Badge variant="outline" className="font-mono text-[10px]">NVD</Badge>
      )}
      {set.has("bdu") && (
        <Badge variant="secondary" className="font-mono text-[10px]">BDU</Badge>
      )}
      {set.size === 0 && <span className="text-xs text-muted-foreground">—</span>}
    </span>
  );
}
