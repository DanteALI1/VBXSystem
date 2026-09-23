"use client";

import Link from "next/link";
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
import type { AppRole } from "@/lib/auth/roles";
import type { FindingListItem } from "@/lib/findings/types";
import { FindingStatusSelect } from "./finding-status-select";

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, FindingListItem>();

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

function CveCell({ item }: { item: FindingListItem }) {
  if (!item.cveId) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  if (item.vulnerabilityId) {
    return (
      <Link
        href={`/app/vulnerabilities/${item.vulnerabilityId}`}
        className="font-mono text-xs underline-offset-2 hover:underline"
        data-testid="finding-cve-link"
      >
        {item.cveId}
      </Link>
    );
  }
  return (
    <span className="font-mono text-xs" data-testid="finding-cve">
      {item.cveId}
    </span>
  );
}

export function FindingsTable({
  items,
  total,
  page,
  pageSize,
  query,
  canChangeStatus,
  role,
}: {
  items: FindingListItem[];
  total: number;
  page: number;
  pageSize: number;
  query: Record<string, string | undefined>;
  canChangeStatus: boolean;
  role: AppRole;
}) {
  const columns = helper.columns([
    helper.accessor("severity", {
      header: "Severity",
      cell: (info) => <SeverityBadge severity={info.getValue()} />,
    }),
    helper.accessor("title", {
      header: "Title",
      cell: (info) => (
        <span
          className="max-w-[320px] truncate text-sm font-medium"
          title={info.getValue()}
        >
          {info.getValue()}
        </span>
      ),
    }),
    helper.accessor((row) => row.asset.hostname, {
      id: "asset",
      header: "Asset",
      cell: (info) => (
        <Link
          href={`/app/assets/${info.row.original.asset.id}`}
          className="font-mono text-xs underline-offset-2 hover:underline"
          data-testid="finding-asset-link"
        >
          {info.getValue()}
        </Link>
      ),
    }),
    helper.accessor("cveId", {
      header: "CVE",
      cell: (info) => <CveCell item={info.row.original} />,
    }),
    helper.accessor("status", {
      header: "Status",
      cell: (info) =>
        canChangeStatus ? (
          <FindingStatusSelect
            key={`${info.row.original.id}:${info.row.original.status}`}
            finding={info.row.original}
            role={role}
          />
        ) : (
          <span
            className="font-mono text-xs"
            data-testid="finding-status-readonly"
          >
            {info.getValue()}
          </span>
        ),
    }),
    helper.accessor((row) => row.scanJob, {
      id: "scanJob",
      header: "Scan",
      cell: (info) => {
        const job = info.getValue();
        if (!job) {
          return <span className="text-muted-foreground text-xs">—</span>;
        }
        return (
          <Link
            href={`/app/scans`}
            className="font-mono text-xs underline-offset-2 hover:underline"
            title={job.id}
            data-testid="finding-scan-link"
          >
            {job.type}
          </Link>
        );
      },
    }),
  ]);

  const table = useTable({ features, columns, data: items });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3" data-testid="findings-table">
      <p className="text-muted-foreground text-xs" data-testid="findings-count">
        {total} finding{total === 1 ? "" : "s"}
        {totalPages > 1 ? ` · page ${page}/${totalPages}` : ""}
      </p>

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
            <TableRow data-testid="findings-empty">
              <TableCell
                colSpan={columns.length}
                className="text-muted-foreground h-24 text-center text-sm"
              >
                No findings. Run a fixture scan to populate results.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="h-9"
                data-testid="finding-row"
                data-finding-id={row.original.id}
                data-status={row.original.status}
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

      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          {page <= 1 ? (
            <Button variant="outline" size="xs" disabled>
              Prev
            </Button>
          ) : (
            <Button
              variant="outline"
              size="xs"
              nativeButton={false}
              render={<Link href={buildPageHref(query, page - 1)} />}
              data-testid="findings-prev"
            >
              Prev
            </Button>
          )}
          {page >= totalPages ? (
            <Button variant="outline" size="xs" disabled>
              Next
            </Button>
          ) : (
            <Button
              variant="outline"
              size="xs"
              nativeButton={false}
              render={<Link href={buildPageHref(query, page + 1)} />}
              data-testid="findings-next"
            >
              Next
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
