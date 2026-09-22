"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  dashboardQueryKey,
  fetchDashboard,
  type DashboardSyncState,
} from "@/lib/queries/dashboard";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function formatWhen(iso: string | null) {
  if (!iso) return "Never";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function statusVariant(
  status: DashboardSyncState["status"],
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "succeeded":
      return "default";
    case "running":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

function CountCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card size="sm" className="gap-2">
      <CardHeader className="pb-0">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-heading text-2xl tabular-nums tracking-tight">
          {value}
        </CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent className="text-muted-foreground pt-0 text-xs">
          {hint}
        </CardContent>
      ) : null}
    </Card>
  );
}

function SyncCard({
  title,
  state,
}: {
  title: string;
  state?: DashboardSyncState;
}) {
  return (
    <Card size="sm" className="gap-2">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          <Badge
            variant={state ? statusVariant(state.status) : "outline"}
            className="capitalize"
          >
            {state?.status ?? "idle"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-1 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Last sync</span>
          <span className="tabular-nums">
            {formatWhen(state?.lastSyncAt ?? null)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Last success</span>
          <span className="tabular-nums">
            {formatWhen(state?.lastSuccessAt ?? null)}
          </span>
        </div>
        {state?.cursor ? (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Cursor</span>
            <span className="max-w-[14rem] truncate font-mono">
              {state.cursor}
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DashboardOverview() {
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: dashboardQueryKey,
    queryFn: fetchDashboard,
  });

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Loading counters…</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} size="sm" className="h-24 animate-pulse bg-muted/40" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
        <p className="text-destructive text-sm">
          {error instanceof Error ? error.message : "Failed to load dashboard"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Inventory totals and feed sync status
          </p>
        </div>
        {isFetching ? (
          <span className="text-muted-foreground text-xs">Refreshing…</span>
        ) : null}
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <CountCard label="Vulnerabilities" value={data.vulnerabilities} />
        <CountCard label="Assets" value={data.assets} />
        <CountCard
          label="Open findings"
          value={data.findingsOpen}
          hint="status = open"
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Last sync</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <SyncCard title="NVD" state={data.sync.nvd} />
          <SyncCard title="BDU" state={data.sync.bdu} />
        </div>
      </section>
    </div>
  );
}
