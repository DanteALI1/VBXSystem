"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AllowlistFormDialog } from "./allowlist-form-dialog";
import type { AllowlistFormValues, AllowlistItem } from "./types";

async function readError(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as {
      error?: string | { message?: string };
    };
    if (typeof json.error === "string") return json.error;
    return json.error?.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export function AllowlistPageClient({ canMutate }: { canMutate: boolean }) {
  const [items, setItems] = useState<AllowlistItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<AllowlistItem | null>(null);
  const [pending, startTransition] = useTransition();

  const fetchList = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/allowlist");
      if (!res.ok) {
        setError(await readError(res));
        setItems([]);
        return;
      }
      const json = (await res.json()) as { items: AllowlistItem[] };
      setItems(json.items);
    });
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  async function createEntry(values: AllowlistFormValues) {
    const res = await fetch("/api/allowlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pattern: values.pattern,
        patternType: values.patternType,
        enabled: values.enabled,
        description: values.description || null,
      }),
    });
    if (!res.ok) throw new Error(await readError(res));
    fetchList();
  }

  async function updateEntry(id: string, values: AllowlistFormValues) {
    const res = await fetch(`/api/allowlist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pattern: values.pattern,
        patternType: values.patternType,
        enabled: values.enabled,
        description: values.description || null,
      }),
    });
    if (!res.ok) throw new Error(await readError(res));
    fetchList();
  }

  async function toggleEnabled(item: AllowlistItem, enabled: boolean) {
    const res = await fetch(`/api/allowlist/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    fetchList();
  }

  async function removeEntry(id: string) {
    if (!confirm("Delete this allowlist entry?")) return;
    const res = await fetch(`/api/allowlist/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    fetchList();
  }

  return (
    <div className="space-y-4" data-testid="allowlist-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Allowlist</h1>
          <p className="text-sm text-muted-foreground">
            Scan target allowlist (detect-only). Admin mutate; all roles read.
          </p>
        </div>
        {canMutate ? (
          <Button
            size="sm"
            data-testid="allowlist-create"
            onClick={() => setCreateOpen(true)}
          >
            Add entry
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-destructive" data-testid="allowlist-error">
          {error}
        </p>
      ) : null}

      <Table data-testid="allowlist-table">
        <TableHeader>
          <TableRow>
            <TableHead>Pattern</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Enabled</TableHead>
            <TableHead>Description</TableHead>
            {canMutate ? <TableHead className="w-40">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={canMutate ? 5 : 4}
                className="text-muted-foreground"
              >
                {pending ? "Loading…" : "No allowlist entries."}
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.id} data-testid="allowlist-row">
                <TableCell className="font-mono text-xs">{item.pattern}</TableCell>
                <TableCell>{item.patternType}</TableCell>
                <TableCell>
                  {canMutate ? (
                    <Checkbox
                      checked={item.enabled}
                      data-testid="allowlist-row-enabled"
                      onCheckedChange={(checked) =>
                        void toggleEnabled(item, Boolean(checked))
                      }
                    />
                  ) : item.enabled ? (
                    "yes"
                  ) : (
                    "no"
                  )}
                </TableCell>
                <TableCell className="max-w-xs truncate">
                  {item.description ?? "—"}
                </TableCell>
                {canMutate ? (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="xs"
                        variant="outline"
                        data-testid="allowlist-edit"
                        onClick={() => setEditItem(item)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="destructive"
                        data-testid="allowlist-delete"
                        onClick={() => void removeEntry(item.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <AllowlistFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add allowlist entry"
        submitLabel="Create"
        onSubmit={createEntry}
      />

      <AllowlistFormDialog
        open={Boolean(editItem)}
        onOpenChange={(open) => {
          if (!open) setEditItem(null);
        }}
        title="Edit allowlist entry"
        submitLabel="Save"
        initial={
          editItem
            ? {
                pattern: editItem.pattern,
                patternType: editItem.patternType,
                enabled: editItem.enabled,
                description: editItem.description ?? "",
              }
            : undefined
        }
        onSubmit={async (values) => {
          if (!editItem) return;
          await updateEntry(editItem.id, values);
          setEditItem(null);
        }}
      />
    </div>
  );
}
