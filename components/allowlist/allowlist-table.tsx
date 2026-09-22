"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { toast } from "sonner";
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
import type { AllowlistListItem } from "@/lib/allowlist/types";
import { AllowlistFormDialog } from "./allowlist-form-dialog";

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, AllowlistListItem>();

export function AllowlistTable({
  items,
  total,
  canWrite,
}: {
  items: AllowlistListItem[];
  total: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AllowlistListItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Delete this allowlist rule?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/allowlist/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `Delete failed (${res.status})`);
      }
      toast.success("Rule deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggle(item: AllowlistListItem) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/allowlist/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !item.enabled }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `Update failed (${res.status})`);
      }
      toast.success(item.enabled ? "Rule disabled" : "Rule enabled");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  const columns = helper.columns([
    helper.accessor("type", {
      header: "Type",
      cell: (info) => (
        <span className="font-mono text-xs uppercase">{info.getValue()}</span>
      ),
    }),
    helper.accessor("pattern", {
      header: "Pattern",
      cell: (info) => (
        <span className="font-mono text-xs">{info.getValue()}</span>
      ),
    }),
    helper.accessor("enabled", {
      header: "Status",
      cell: (info) =>
        info.getValue() ? (
          <Badge variant="secondary">Enabled</Badge>
        ) : (
          <Badge variant="outline">Disabled</Badge>
        ),
    }),
    helper.accessor("description", {
      header: "Description",
      cell: (info) => (
        <span className="text-muted-foreground max-w-[280px] truncate text-sm">
          {info.getValue() ?? "—"}
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
                  data-testid="allowlist-toggle"
                  disabled={busyId === row.original.id}
                  onClick={() => void handleToggle(row.original)}
                >
                  {row.original.enabled ? "Disable" : "Enable"}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  data-testid="allowlist-edit"
                  onClick={() => setEditing(row.original)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-destructive"
                  data-testid="allowlist-delete"
                  disabled={busyId === row.original.id}
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
    <div className="space-y-3" data-testid="allowlist-table">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs" data-testid="allowlist-count">
          {total} rule{total === 1 ? "" : "s"}
        </p>
        {canWrite ? (
          <Button
            size="sm"
            data-testid="allowlist-create"
            onClick={() => setCreateOpen(true)}
          >
            New rule
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
            <TableRow data-testid="allowlist-empty">
              <TableCell
                colSpan={columns.length}
                className="text-muted-foreground h-24 text-center text-sm"
              >
                No allowlist rules yet.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="h-9"
                data-testid="allowlist-row"
                data-allowlist-id={row.original.id}
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

      <AllowlistFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <AllowlistFormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        item={editing}
      />
    </div>
  );
}
