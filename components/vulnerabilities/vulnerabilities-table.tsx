"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "@/components/vulnerabilities/severity-badge";
import type { VulnerabilityListItem } from "@/lib/vulnerabilities/types";

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, VulnerabilityListItem>();

const columns = helper.columns([
  helper.accessor("severity", {
    header: "Severity",
    cell: (info) => <SeverityBadge severity={info.getValue()} />,
  }),
  helper.accessor("cveId", {
    header: "CVE",
    cell: (info) => (
      <span className="font-mono text-xs">{info.getValue() ?? "—"}</span>
    ),
  }),
  helper.accessor("bduId", {
    header: "BDU",
    cell: (info) => (
      <span className="font-mono text-xs">{info.getValue() ?? "—"}</span>
    ),
  }),
  helper.accessor("title", {
    header: "Title",
    cell: (info) => (
      <Link
        href={`/app/vulnerabilities/${info.row.original.id}`}
        className="max-w-[420px] truncate font-medium text-foreground underline-offset-2 hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  helper.accessor("cvssScore", {
    header: "CVSS",
    cell: (info) => {
      const v = info.getValue();
      return (
        <span className="font-mono text-xs">
          {v == null ? "—" : v.toFixed(1)}
        </span>
      );
    },
  }),
  helper.accessor("sources", {
    header: "Sources",
    cell: (info) => {
      const sources = info.getValue();
      if (!sources.length) {
        return <span className="text-muted-foreground text-xs">—</span>;
      }
      return (
        <span className="font-mono text-xs uppercase">
          {sources.join(", ")}
        </span>
      );
    },
  }),
  helper.accessor("publishedAt", {
    header: "Published",
    cell: (info) => {
      const v = info.getValue();
      if (!v) return <span className="text-muted-foreground text-xs">—</span>;
      return (
        <span className="font-mono text-xs">
          {new Date(v).toISOString().slice(0, 10)}
        </span>
      );
    },
  }),
]);

function buildPageHref(
  query: Record<string, string | undefined>,
  nextPage: number,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "page") continue;
    if (value) params.set(key, value);
  }
  if (nextPage > 1) params.set("page", String(nextPage));
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

export function VulnerabilitiesTable({
  items,
  total,
  page,
  pageSize,
  query,
}: {
  items: VulnerabilityListItem[];
  total: number;
  page: number;
  pageSize: number;
  query: Record<string, string | undefined>;
}) {
  const data = useMemo(() => items, [items]);
  const table = useTable({ features, columns, data });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="space-y-3" data-testid="vuln-table">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => (
                <TableHead key={header.id} className="h-8 text-xs">
                  {header.isPlaceholder ? null : (
                    <table.FlexRender header={header} />
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow data-testid="vuln-empty">
              <TableCell
                colSpan={columns.length}
                className="text-muted-foreground h-24 text-center text-sm"
              >
                No vulnerabilities match the current filters.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="h-9"
                data-testid="vuln-row"
                data-vuln-id={row.original.id}
              >
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className="py-1.5 text-sm">
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
        <span data-testid="vuln-results-summary">
          {total === 0
            ? "0 results"
            : `${from}–${to} of ${total} · page ${page}/${totalPages}`}
        </span>
        <div className="flex gap-2">
          {page <= 1 ? (
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={buildPageHref(query, page - 1)} />}
            >
              Previous
            </Button>
          )}
          {page >= totalPages ? (
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={buildPageHref(query, page + 1)} />}
            >
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
