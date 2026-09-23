"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { VulnSortField } from "@/lib/search/constants";
import { SeverityBadge } from "./severity-badge";
import { SourceBadges } from "./source-badges";
import type { VulnListItem } from "./types";

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, VulnListItem>();

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function SortHeader({
  label,
  active,
  order,
  onClick,
}: {
  label: string;
  active: boolean;
  order: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-medium hover:underline"
      onClick={onClick}
    >
      {label}
      {active && (
        <span className="text-[10px] text-muted-foreground">
          {order === "asc" ? "↑" : "↓"}
        </span>
      )}
    </button>
  );
}

export function VulnerabilitiesTable({
  items,
  sort,
  order,
  onSort,
}: {
  items: VulnListItem[];
  sort: string;
  order: string;
  onSort: (field: VulnSortField) => void;
}) {
  const router = useRouter();

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor((r) => r.cveId ?? r.bduId ?? r.id, {
          id: "id",
          header: () => (
            <SortHeader
              label="ID"
              active={sort === "cveId"}
              order={order}
              onClick={() => onSort("cveId")}
            />
          ),
          cell: ({ row }) => (
            <div className="flex flex-col gap-0.5 font-mono text-xs">
              {row.original.cveId && <span>{row.original.cveId}</span>}
              {row.original.bduId && (
                <span className="text-muted-foreground">
                  {row.original.bduId}
                </span>
              )}
            </div>
          ),
        }),
        helper.accessor("vendorCount", {
          header: "Vendors",
          cell: ({ row }) => (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger className="cursor-default text-xs">
                  {row.original.vendorCount}
                </TooltipTrigger>
                <TooltipContent>
                  {row.original.vendors.length
                    ? row.original.vendors.join(", ")
                    : "No vendors"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ),
        }),
        helper.accessor("productCount", {
          header: "Products",
          cell: ({ row }) => (
            <span className="text-xs">{row.original.productCount}</span>
          ),
        }),
        helper.accessor("localSyncedAt", {
          header: () => (
            <SortHeader
              label="Updated"
              active={sort === "updated"}
              order={order}
              onClick={() => onSort("updated")}
            />
          ),
          cell: ({ getValue }) => (
            <span className="text-xs tabular-nums">
              {formatDate(getValue())}
            </span>
          ),
        }),
        helper.accessor("cvssScore", {
          header: () => (
            <SortHeader
              label="CVSS"
              active={sort === "cvss"}
              order={order}
              onClick={() => onSort("cvss")}
            />
          ),
          cell: ({ row }) => (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs tabular-nums">
                {row.original.cvssScore?.toFixed(1) ?? "—"}
              </span>
              <SeverityBadge severity={row.original.severity} />
            </div>
          ),
        }),
        helper.accessor("sources", {
          header: "Sources",
          cell: ({ getValue }) => <SourceBadges sources={getValue()} />,
        }),
        helper.accessor("kev", {
          header: "KEV",
          cell: ({ getValue }) =>
            getValue() ? (
              <Badge variant="destructive" className="text-[10px]">
                KEV
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            ),
        }),
        helper.accessor("epssScore", {
          header: () => (
            <SortHeader
              label="EPSS"
              active={sort === "epss"}
              order={order}
              onClick={() => onSort("epss")}
            />
          ),
          cell: ({ getValue }) => {
            const v = getValue();
            return (
              <span className="font-mono text-xs tabular-nums">
                {v == null ? "—" : v.toFixed(3)}
              </span>
            );
          },
        }),
        helper.accessor("tags", {
          header: "Tags",
          cell: ({ getValue }) => {
            const tags = getValue();
            if (!tags.length) {
              return <span className="text-xs text-muted-foreground">—</span>;
            }
            return (
              <span className="inline-flex flex-wrap gap-1">
                {tags.slice(0, 3).map((t) => (
                  <Badge key={t.id} variant="secondary" className="text-[10px]">
                    {t.name}
                  </Badge>
                ))}
                {tags.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{tags.length - 3}
                  </span>
                )}
              </span>
            );
          },
        }),
        helper.accessor("descriptionSnippet", {
          header: "Description",
          cell: ({ getValue }) => (
            <span className="block max-w-[28rem] truncate text-xs text-muted-foreground">
              {getValue() || "—"}
            </span>
          ),
        }),
      ]),
    [sort, order, onSort],
  );

  const table = useTable({
    features,
    columns,
    data: items,
  });

  return (
    <div className="relative max-h-[70vh] overflow-auto rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_var(--border)]">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
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
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No vulnerabilities found
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                data-testid="vuln-row"
                onClick={() =>
                  router.push(`/app/vulnerabilities/${row.original.id}`)
                }
              >
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
