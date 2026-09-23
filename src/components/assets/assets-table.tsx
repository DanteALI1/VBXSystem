"use client";

import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AssetListItem } from "./types";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AssetsTable({ items }: { items: AssetListItem[] }) {
  const router = useRouter();

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground" data-testid="assets-empty">
        No assets yet.
      </p>
    );
  }

  return (
    <Table data-testid="assets-table">
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Hostname</TableHead>
          <TableHead>IP</TableHead>
          <TableHead>Environment</TableHead>
          <TableHead>Criticality</TableHead>
          <TableHead>Services</TableHead>
          <TableHead>Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((row) => (
          <TableRow
            key={row.id}
            className="cursor-pointer"
            data-testid="asset-row"
            onClick={() => router.push(`/app/assets/${row.id}`)}
          >
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell className="font-mono text-xs">
              {row.hostname ?? "—"}
            </TableCell>
            <TableCell className="font-mono text-xs">{row.ip ?? "—"}</TableCell>
            <TableCell>{row.environment ?? "—"}</TableCell>
            <TableCell>{row.criticality}</TableCell>
            <TableCell>{row.serviceCount}</TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {formatDate(row.updatedAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
