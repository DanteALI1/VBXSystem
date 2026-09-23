import Link from "next/link";
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

const KPI_PLACEHOLDERS = [
  { label: "Vulnerabilities", value: 0, hint: "Total catalog" },
  { label: "Critical / High", value: "0 / 0", hint: "Severity focus" },
  { label: "Findings open", value: 0, hint: "Active findings" },
  { label: "Assets", value: 0, hint: "Inventory" },
  { label: "Last NVD sync", value: "—", hint: "Never" },
  { label: "Last BDU sync", value: "—", hint: "Never" },
] as const;

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Dashboard
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Console overview — counters are placeholders until the summary API is wired.
        </p>
      </div>

      <section aria-label="Key metrics">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {KPI_PLACEHOLDERS.map((kpi) => (
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
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-24 text-center text-zinc-500"
                  >
                    No recent updates.
                  </TableCell>
                </TableRow>
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
