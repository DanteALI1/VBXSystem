"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AssetListItem } from "@/lib/assets/types";
import { AssetFormDialog } from "./asset-form-dialog";

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, AssetListItem>();

export function AssetsTable({
  items,
  total,
  canWrite,
}: {
  items: AssetListItem[];
  total: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AssetListItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (
      !confirm(
        "Delete this asset? Related services and findings will be removed.",
      )
    ) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `Delete failed (${res.status})`);
      }
      toast.success("Asset deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  const columns = helper.columns([
    helper.accessor("hostname", {
      header: "Hostname",
      cell: (info) => (
        <Link
          href={`/app/assets/${info.row.original.id}`}
          className="font-medium underline-offset-2 hover:underline"
          data-testid="asset-hostname-link"
        >
          {info.getValue()}
        </Link>
      ),
    }),
    helper.accessor("ip", {
      header: "IP",
      cell: (info) => (
        <span className="font-mono text-xs">{info.getValue()}</span>
      ),
    }),
    helper.accessor("description", {
      header: "Description",
      cell: (info) => (
        <span className="text-muted-foreground max-w-[360px] truncate text-sm">
          {info.getValue() ?? "—"}
        </span>
      ),
    }),
    helper.accessor("updatedAt", {
      header: "Updated",
      cell: (info) => (
        <span className="font-mono text-xs">
          {new Date(info.getValue()).toISOString().slice(0, 10)}
        </span>
      ),
    }),
    ...(canWrite
      ? [
          helper.display({
            id: "actions",
            header: "",
            cell: ({ row }) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="xs"
                  data-testid="asset-edit"
                  onClick={() => setEditing(row.original)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-destructive"
                  data-testid="asset-delete"
                  disabled={deletingId === row.original.id}
                  onClick={() => void handleDelete(row.original.id)}
                >
                  Delete
                </Button>
              </div>
            ),
          }),
        ]
      : []),
  ]);

  const table = useTable({ features, columns, data: items });

  return (
    <div className="space-y-3" data-testid="assets-table">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs" data-testid="assets-count">
          {total} asset{total === 1 ? "" : "s"}
        </p>
        {canWrite ? (
          <Button
            size="sm"
            data-testid="asset-create"
            onClick={() => setCreateOpen(true)}
          >
            New asset
          </Button>
        ) : null}
      </div>

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
            <TableRow data-testid="assets-empty">
              <TableCell
                colSpan={columns.length}
                className="text-muted-foreground h-24 text-center text-sm"
              >
                No assets yet.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="h-9"
                data-testid="asset-row"
                data-asset-id={row.original.id}
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

      <AssetFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <AssetFormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        asset={editing}
      />
    </div>
  );
}
