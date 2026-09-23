"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScanCreateDialog } from "./scan-create-dialog";
import type { ScanCreateValues, ScanJobItem } from "./types";

async function readError(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as {
      error?: string | { message?: string; code?: string };
    };
    if (typeof json.error === "string") return json.error;
    if (json.error && typeof json.error === "object") {
      const code = json.error.code ? `[${json.error.code}] ` : "";
      return `${code}${json.error.message ?? res.statusText}`;
    }
    return res.statusText;
  } catch {
    return res.statusText;
  }
}

function statusVariant(
  status: ScanJobItem["status"],
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

export function ScansPageClient({ canCreate }: { canCreate: boolean }) {
  const [items, setItems] = useState<ScanJobItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const fetchList = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/scans");
      if (!res.ok) {
        setError(await readError(res));
        setItems([]);
        return;
      }
      const json = (await res.json()) as { items: ScanJobItem[] };
      setItems(json.items);
    });
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  async function createScan(values: ScanCreateValues) {
    const options: Record<string, unknown> = {};
    if (values.type === "nmap" && values.ports) {
      options.ports = values.ports;
    }
    if (values.type === "nuclei" && values.templates) {
      options.templates = values.templates
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const res = await fetch("/api/scans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: values.type,
        target: values.target,
        options,
      }),
    });
    if (!res.ok) throw new Error(await readError(res));
    fetchList();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Scans</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-500">
            Allowlist-gated discovery jobs (nmap / nuclei). Targets outside the
            enabled allowlist are rejected. Nuclei is detection-only.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchList()}
            disabled={pending}
          >
            Refresh
          </Button>
          {canCreate ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              New scan
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Targets</TableHead>
              <TableHead>Error</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-500">
                  {pending ? "Loading…" : "No scan jobs yet."}
                </TableCell>
              </TableRow>
            ) : (
              items.map((job) => (
                <TableRow key={job.id} data-testid="scan-job-row">
                  <TableCell>
                    <Badge variant={statusVariant(job.status)}>
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{job.type}</TableCell>
                  <TableCell className="max-w-[240px] truncate font-mono text-xs">
                    {job.targets.join(", ")}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-zinc-500">
                    {job.errorMessage ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-zinc-500">
                    {new Date(job.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ScanCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={createScan}
      />
    </div>
  );
}
