"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AssetFormDialog } from "./asset-form-dialog";
import { AssetsTable } from "./assets-table";
import type { AssetFormValues, AssetListItem } from "./types";

type ListResponse = {
  items: AssetListItem[];
  page: number;
  pageSize: number;
  total: number;
};

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

export function AssetsPageClient({ canMutate }: { canMutate: boolean }) {
  const [q, setQ] = useState("");
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const fetchList = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      const res = await fetch(`/api/assets?${sp.toString()}`);
      if (!res.ok) {
        setError(await readError(res));
        setData(null);
        return;
      }
      setData((await res.json()) as ListResponse);
    });
  }, [q]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  async function createAsset(values: AssetFormValues) {
    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: values.name,
        hostname: values.hostname || null,
        ip: values.ip || null,
        environment: values.environment || null,
        criticality: values.criticality,
        notes: values.notes || null,
      }),
    });
    if (!res.ok) throw new Error(await readError(res));
    fetchList();
  }

  return (
    <div className="space-y-4" data-testid="assets-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Assets</h1>
          <p className="text-sm text-muted-foreground">
            Inventory of monitored hosts and services.
          </p>
        </div>
        {canMutate ? (
          <Button
            size="sm"
            data-testid="asset-create"
            onClick={() => setCreateOpen(true)}
          >
            New asset
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search name / host / IP"
          data-testid="assets-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchList()}
          disabled={pending}
        >
          Refresh
        </Button>
        {data ? (
          <span className="text-xs text-muted-foreground" data-testid="assets-count">
            {data.total} asset{data.total === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-destructive" data-testid="assets-error">
          {error}
        </p>
      ) : null}

      <AssetsTable items={data?.items ?? []} />

      <AssetFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create asset"
        description="Name is required. Prefer at least one of hostname or IP."
        submitLabel="Create"
        onSubmit={createAsset}
      />
    </div>
  );
}
