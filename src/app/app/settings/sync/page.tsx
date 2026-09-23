"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { BduSyncControls } from "@/components/settings/bdu-sync-controls";

type SyncSourceState = {
  source: string;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  cursor: string | null;
  meta: Record<string, unknown>;
  updatedAt: string;
} | null;

type SyncStateResponse = {
  sources: {
    nvd: SyncSourceState;
    bdu: SyncSourceState;
  };
};

function formatTs(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function SyncSettingsPage() {
  const [state, setState] = useState<SyncStateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/settings/sync", { credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as SyncStateResponse;
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enqueueNvd = (mode: "incremental" | "full") => {
    startTransition(async () => {
      setError(null);
      setJobId(null);
      try {
        const res = await fetch("/api/settings/sync/nvd", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          jobId?: string;
        };
        if (!res.ok) {
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        setJobId(body.jobId ?? null);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const nvd = state?.sources.nvd;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Sync
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Catalog synchronization from NVD and BDU. Jobs enqueue immediately;
          workers perform the sync in the background.
        </p>
      </div>

      <section className="space-y-3" aria-labelledby="nvd-sync-heading">
        <div>
          <h2
            id="nvd-sync-heading"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
          >
            NVD (CVE API 2.0)
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Incremental or windowed full sync. Requires analyst or admin.
          </p>
        </div>

        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              Last success
            </dt>
            <dd className="text-zinc-800 dark:text-zinc-200">
              {loading ? "…" : formatTs(nvd?.lastSuccessAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              Last attempt
            </dt>
            <dd className="text-zinc-800 dark:text-zinc-200">
              {loading ? "…" : formatTs(nvd?.lastAttemptAt)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              Cursor
            </dt>
            <dd className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
              {loading ? "…" : (nvd?.cursor ?? "—")}
            </dd>
          </div>
          {nvd?.lastError ? (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                Last error
              </dt>
              <dd className="text-sm text-red-600 dark:text-red-400">
                {nvd.lastError}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => enqueueNvd("incremental")}
            data-testid="nvd-sync-incremental"
          >
            {pending ? "Enqueueing…" : "Sync NVD (incremental)"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => enqueueNvd("full")}
            data-testid="nvd-sync-full"
          >
            Sync NVD (windowed full)
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending || loading}
            onClick={() => void refresh()}
          >
            Refresh status
          </Button>
        </div>

        {jobId ? (
          <p
            className="text-sm text-zinc-600 dark:text-zinc-400"
            data-testid="nvd-job-id"
          >
            Enqueued job <span className="font-mono">{jobId}</span>
          </p>
        ) : null}
      </section>

      <section className="space-y-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <BduSyncControls />
      </section>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
