"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FINDING_STATUSES, type FindingStatus } from "@/lib/findings/status";
import { FindingsTable } from "./findings-table";
import type { FindingsListResponse } from "./types";

async function readError(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as {
      error?: string | { message?: string; code?: string };
    };
    if (typeof json.error === "string") return json.error;
    return json.error?.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export function FindingsPageClient({
  canTransition,
}: {
  canTransition: boolean;
}) {
  const searchParams = useSearchParams();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [data, setData] = useState<FindingsListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const vulnerabilityId = (searchParams.get("vulnerabilityId") ?? "").trim();
  const cveId = (searchParams.get("cveId") ?? "").trim();
  const bduId = (searchParams.get("bduId") ?? "").trim();
  const assetId = (searchParams.get("assetId") ?? "").trim();

  const fetchList = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      if (status) sp.set("status", status);
      if (severity) sp.set("severity", severity);
      if (vulnerabilityId) sp.set("vulnerabilityId", vulnerabilityId);
      if (cveId) sp.set("cveId", cveId);
      if (bduId) sp.set("bduId", bduId);
      if (assetId) sp.set("assetId", assetId);
      const res = await fetch(`/api/findings?${sp.toString()}`);
      if (!res.ok) {
        setError(await readError(res));
        setData(null);
        return;
      }
      setData((await res.json()) as FindingsListResponse);
    });
  }, [q, status, severity, vulnerabilityId, cveId, bduId, assetId]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  async function changeStatus(id: string, next: FindingStatus) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/findings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      fetchList();
    } finally {
      setPendingId(null);
    }
  }

  const correlationHint = [vulnerabilityId && "vulnerability", cveId && "CVE", bduId && "BDU"]
    .filter(Boolean)
    .join(" / ");

  return (
    <div className="space-y-3" data-testid="findings-page">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Findings</h1>
        <p className="text-sm text-muted-foreground">
          Scan and correlation findings with triage status.
          {correlationHint ? (
            <span className="ml-1 text-xs">(filtered by {correlationHint})</span>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 max-w-xs text-xs"
          placeholder="Search title / CVE / BDU / asset"
          data-testid="findings-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
          data-testid="findings-filter-status"
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {FINDING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
          data-testid="findings-filter-severity"
          aria-label="Filter by severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option value="">All severities</option>
          {["critical", "high", "medium", "low", "none"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => fetchList()}
          disabled={pending}
        >
          Refresh
        </Button>
        {data ? (
          <span
            className="text-xs text-muted-foreground"
            data-testid="findings-count"
          >
            {data.total} finding{data.total === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-destructive" data-testid="findings-error">
          {error}
        </p>
      ) : null}

      <FindingsTable
        items={data?.items ?? []}
        canTransition={canTransition}
        pendingId={pendingId}
        onStatusChange={changeStatus}
      />
    </div>
  );
}
