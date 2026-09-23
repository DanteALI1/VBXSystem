import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KpiCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
};

export function KpiCard({ label, value, hint, className }: KpiCardProps) {
  return (
    <Card size="sm" className={cn("rounded-md shadow-none", className)}>
      <CardHeader className="pb-0">
        <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-1">
        <p className="font-mono text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {value}
        </p>
        {hint ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
