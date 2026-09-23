"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ScanListItem } from "@/lib/scans/types";
import { CreateScanDialog } from "./create-scan-dialog";

function statusVariant(
  status: ScanListItem["status"],
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "succeeded":
      return "default";
    case "failed":
      return "destructive";
    case "running":
      return "secondary";
    default:
      return "outline";
  }
}

export function ScansTable({
  items,
  total,
  canCreate,
}: {
  items: ScanListItem[];
  total: number;
  canCreate: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3" data-testid="scans-table">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs" data-testid="scans-count">
          {total} scan{total === 1 ? "" : "s"}
        </p>
        {canCreate ? (
          <Button
            size="sm"
            data-testid="scans-create"
            onClick={() => setOpen(true)}
          >
            New scan
          </Button>
        ) : null}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow data-testid="scans-empty">
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground h-24 text-center text-sm"
                >
                  No scans yet. Queue an nmap or nuclei fixture job to get
                  started.
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow
                  key={row.id}
                  data-testid="scans-row"
                  data-scan-id={row.id}
                >
                  <TableCell className="font-mono text-xs">{row.type}</TableCell>
                  <TableCell className="max-w-[220px] truncate font-mono text-xs">
                    {row.target}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(row.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[240px] truncate text-xs">
                    {row.error ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {canCreate ? (
        <CreateScanDialog open={open} onOpenChange={setOpen} />
      ) : null}
    </div>
  );
}
