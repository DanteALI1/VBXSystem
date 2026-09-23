"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SeverityBadge } from "@/components/vulnerabilities/severity-badge";
import { FINDING_STATUSES, type FindingStatus } from "@/lib/findings/status";
import { cn } from "@/lib/utils";
import type { FindingListItem } from "./types";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const STATUS_CLASS: Record<FindingStatus, string> = {
  open: "text-amber-700",
  fixed: "text-emerald-700",
  accepted: "text-sky-700",
  false_positive: "text-zinc-500",
};

export function FindingsTable({
  items,
  canTransition,
  pendingId,
  onStatusChange,
}: {
  items: FindingListItem[];
  canTransition: boolean;
  pendingId: string | null;
  onStatusChange: (id: string, status: FindingStatus) => void;
}) {
  if (items.length === 0) {
    return (
      <p
        className="py-8 text-center text-sm text-muted-foreground"
        data-testid="findings-empty"
      >
        No findings match the filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="findings-table">
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 px-2">Status</TableHead>
            <TableHead className="h-8 px-2">Severity</TableHead>
            <TableHead className="h-8 px-2">Title</TableHead>
            <TableHead className="h-8 px-2">Asset</TableHead>
            <TableHead className="h-8 px-2">CVE / BDU</TableHead>
            <TableHead className="h-8 px-2">Scan</TableHead>
            <TableHead className="h-8 px-2">Updated</TableHead>
            {canTransition ? (
              <TableHead className="h-8 px-2 w-[9rem]">Action</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row) => (
            <TableRow
              key={row.id}
              className="h-9"
              data-testid="finding-row"
              data-finding-id={row.id}
            >
              <TableCell className="px-2 py-1">
                <span
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-wide",
                    STATUS_CLASS[row.status],
                  )}
                  data-testid="finding-status"
                >
                  {row.status}
                </span>
              </TableCell>
              <TableCell className="px-2 py-1">
                <SeverityBadge severity={row.severity} />
              </TableCell>
              <TableCell className="max-w-[16rem] truncate px-2 py-1 font-medium">
                {row.vulnerabilityId ? (
                  <Link
                    href={`/app/vulnerabilities/${row.vulnerabilityId}`}
                    className="hover:underline"
                  >
                    {row.title}
                  </Link>
                ) : (
                  row.title
                )}
              </TableCell>
              <TableCell className="px-2 py-1">
                {row.assetId ? (
                  <Link
                    href={`/app/assets/${row.assetId}`}
                    className="hover:underline"
                  >
                    {row.assetName ?? row.assetId.slice(0, 8)}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="px-2 py-1 font-mono text-[10px]">
                <div className="flex flex-col gap-0.5">
                  <span>{row.cveId ?? "—"}</span>
                  <span className="text-muted-foreground">
                    {row.bduId ?? "—"}
                  </span>
                </div>
              </TableCell>
              <TableCell className="px-2 py-1 font-mono text-[10px] text-muted-foreground">
                {row.scanJobType
                  ? `${row.scanJobType}${row.scanJobId ? ` · ${row.scanJobId.slice(0, 8)}` : ""}`
                  : row.scanJobId
                    ? row.scanJobId.slice(0, 8)
                    : "—"}
              </TableCell>
              <TableCell className="px-2 py-1 text-muted-foreground">
                {formatDate(row.updatedAt)}
              </TableCell>
              {canTransition ? (
                <TableCell className="px-2 py-1">
                  <select
                    className="h-7 w-full rounded border border-input bg-transparent px-1 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                    data-testid="finding-status-select"
                    aria-label={`Change status for ${row.title}`}
                    value={row.status}
                    disabled={pendingId === row.id}
                    onChange={(e) => {
                      const next = e.target.value as FindingStatus;
                      if (next !== row.status) onStatusChange(row.id, next);
                    }}
                  >
                    {FINDING_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
