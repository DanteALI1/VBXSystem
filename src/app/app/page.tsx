import Link from "next/link";
import { headers } from "next/headers";
import { KpiCard } from "@/components/app/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Summary = {
  vulnerabilitiesTotal: number;
  critical: number;
  high: number;
  findingsOpen: number;
  assets: number;
  lastNvdSync: string | null;
  lastBduSync: string | null;
  recent: {
    id: string;
    cveId: string | null;
    bduId: string | null;
    title: string;
    severity: string | null;
    localSyncedAt: string | null;
  }[];
};

function fmtSync(v: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return "—";
  }
}

async function loadSummary(): Promise<Summary> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = process.env.APP_URL ?? `${proto}://${host}`;
  const res = await fetch(`${base}/api/dashboard/summary`, {
    cache: "no-store",
    headers: { cookie: h.get("cookie") ?? "" },
  });
  if (!res.ok) {
    return {
      vulnerabilitiesTotal: 0,
      critical: 0,
      high: 0,
      findingsOpen: 0,
      assets: 0,
      lastNvdSync: null,
      lastBduSync: null,
      recent: [],
    };
  }
  return res.json();
}

export default async function DashboardPage() {
  const summary = await loadSummary();
  const kpis = [
    { label: "Vulnerabilities", value: summary.vulnerabilitiesTotal, hint: "Total catalog" },
    {
      label: "Critical / High",
      value: `${summary.critical} / ${summary.high}`,
      hint: "Severity focus",
    },
    { label: "Findings open", value: summary.findingsOpen, hint: "Active findings" },
    { label: "Assets", value: summary.assets, hint: "Inventory" },
    { label: "Last NVD sync", value: fmtSync(summary.lastNvdSync), hint: "SyncState" },
    { label: "Last BDU sync", value: fmtSync(summary.lastBduSync), hint: "SyncState" },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Dashboard
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Console overview — totals from local catalog and sync state.
        </p>
      </div>

      <section aria-label="Key metrics">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((kpi) => (
            <KpiCard
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              hint={kpi.hint}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2" aria-label="Recent vulnerability updates">
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Recent vulnerability updates
          </h2>
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.recent.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-24 text-center text-zinc-500"
                    >
                      No recent updates.
                    </TableCell>
                  </TableRow>
                ) : (
                  summary.recent.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">
                        <Link
                          href={`/app/vulnerabilities/${row.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {row.cveId ?? row.bduId ?? row.id.slice(0, 8)}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs">
                        {row.title}
                      </TableCell>
                      <TableCell className="text-xs uppercase">
                        {row.severity ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {fmtSync(row.localSyncedAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-2" aria-label="Recent findings">
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            My / recent findings
          </h2>
          <div className="rounded-md border border-dashed border-zinc-300 bg-white px-4 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500">No findings yet.</p>
          </div>
        </section>
      </div>

      <section className="space-y-2" aria-label="Quick links">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Quick links
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/settings/sync"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Sync
          </Link>
          <Link
            href="/app/scans"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Create scan
          </Link>
          <Link
            href="/app/settings/allowlist"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Allowlist
          </Link>
        </div>
      </section>
    </div>
  );
}
