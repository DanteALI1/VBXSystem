"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AppRole } from "@/lib/auth/roles";
import { canTriggerSync } from "@/lib/auth/roles";

type SyncStateDto = {
  source: "nvd" | "bdu";
  status: "idle" | "running" | "succeeded" | "failed";
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  cursor: string | null;
  fileHash: string | null;
  metaJson: unknown;
};

type SyncStatusResponse = {
  nvd: SyncStateDto;
  bdu: SyncStateDto;
  jobs: {
    nvd: { id: string; state: string } | null;
    bdu: { id: string; state: string } | null;
  };
};

const syncStatusKey = ["sync-status"] as const;

async function fetchSyncStatus(): Promise<SyncStatusResponse> {
  const res = await fetch("/api/sync/status");
  if (!res.ok) throw new Error(`Status ${res.status}`);
  return res.json() as Promise<SyncStatusResponse>;
}

function formatWhen(iso: string | null) {
  if (!iso) return "Never";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function statusVariant(
  status: SyncStateDto["status"],
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "succeeded":
      return "default";
    case "running":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

function SyncSourceRow({
  title,
  state,
  jobId,
}: {
  title: string;
  state: SyncStateDto;
  jobId?: string | null;
}) {
  return (
    <div className="grid gap-1 border-b py-3 last:border-b-0 sm:grid-cols-[140px_1fr_1fr_1fr] sm:items-center sm:gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{title}</span>
        <Badge variant={statusVariant(state.status)}>{state.status}</Badge>
      </div>
      <div className="text-muted-foreground text-xs">
        Last sync: {formatWhen(state.lastSyncAt)}
      </div>
      <div className="text-muted-foreground text-xs">
        Last success: {formatWhen(state.lastSuccessAt)}
      </div>
      <div className="text-muted-foreground truncate font-mono text-xs">
        {jobId
          ? `job ${jobId}`
          : state.fileHash
            ? `hash ${state.fileHash.slice(0, 12)}…`
            : "—"}
      </div>
    </div>
  );
}

export function SyncPanel({
  role,
  nvdSyncDays = 30,
  nvdSyncMode = "live",
}: {
  role: AppRole;
  /** Safe documented window from env (no secrets). */
  nvdSyncDays?: number;
  /** Default env mode; UI fixture checkbox can override per enqueue. */
  nvdSyncMode?: string;
}) {
  const isAdmin = canTriggerSync(role);
  const queryClient = useQueryClient();
  const [fileKey, setFileKey] = useState(0);
  const [fixtureMode, setFixtureMode] = useState(true);

  const statusQuery = useQuery({
    queryKey: syncStatusKey,
    queryFn: fetchSyncStatus,
    refetchInterval: (q) => {
      const d = q.state.data;
      if (d?.nvd.status === "running" || d?.bdu.status === "running") {
        return 2000;
      }
      return 15_000;
    },
  });

  const nvdMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sync/nvd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: fixtureMode ? "fixture" : "live",
          force: true,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ jobId: string }>;
    },
    onSuccess: (data) => {
      toast.success(`NVD sync queued (${data.jobId})`);
      void queryClient.invalidateQueries({ queryKey: syncStatusKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bduMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sync/bdu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: fixtureMode ? "fixture" : "live",
          force: true,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ jobId: string }>;
    },
    onSuccess: (data) => {
      toast.success(`BDU sync queued (${data.jobId})`);
      void queryClient.invalidateQueries({ queryKey: syncStatusKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.set("file", file);
      form.set("force", "true");
      const res = await fetch("/api/sync/bdu/upload", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ jobId: string }>;
    },
    onSuccess: (data) => {
      toast.success(`BDU upload queued (${data.jobId})`);
      void queryClient.invalidateQueries({ queryKey: syncStatusKey });
      setFileKey((k) => k + 1);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const busy =
    nvdMutation.isPending || bduMutation.isPending || uploadMutation.isPending;

  return (
    <div className="space-y-6" data-testid="sync-panel">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sync</h1>
        <p className="text-muted-foreground text-sm">
          Enqueue NVD CVE API and BDU XML sync jobs. Long work runs in the
          worker — this page only queues.
        </p>
      </div>

      <section
        className="bg-muted/40 space-y-2 rounded-md border p-3"
        data-testid="sync-config"
      >
        <h2 className="text-sm font-medium">Configuration</h2>
        <p className="text-muted-foreground text-xs">
          Documented sync settings (no secrets). Env defaults apply when not
          overridden by the fixture control below.
        </p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex items-baseline justify-between gap-2 border-b pb-1 sm:border-0 sm:pb-0">
            <dt className="text-muted-foreground font-mono text-xs">
              NVD_SYNC_DAYS
            </dt>
            <dd className="font-mono" data-testid="sync-config-nvd-days">
              {nvdSyncDays}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 border-b pb-1 sm:border-0 sm:pb-0">
            <dt className="text-muted-foreground font-mono text-xs">
              NVD_SYNC_MODE
            </dt>
            <dd className="font-mono" data-testid="sync-config-nvd-mode">
              {nvdSyncMode}
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-1" data-testid="sync-status">
        <h2 className="text-sm font-medium">Status</h2>
        {statusQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : statusQuery.isError ? (
          <p className="text-destructive text-sm">Failed to load sync status</p>
        ) : (
          <div>
            <SyncSourceRow
              title="NVD"
              state={statusQuery.data!.nvd}
              jobId={statusQuery.data!.jobs.nvd?.id}
            />
            <SyncSourceRow
              title="BDU"
              state={statusQuery.data!.bdu}
              jobId={statusQuery.data!.jobs.bdu?.id}
            />
          </div>
        )}
      </section>

      {isAdmin ? (
        <section className="space-y-3" data-testid="sync-actions">
          <h2 className="text-sm font-medium">Actions</h2>
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={fixtureMode}
              onChange={(e) => setFixtureMode(e.target.checked)}
              className="size-3.5"
              data-testid="sync-fixture-mode"
            />
            Fixture mode (no external network; uses repo fixtures)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={busy || statusQuery.data?.nvd.status === "running"}
              onClick={() => nvdMutation.mutate()}
              data-testid="sync-nvd"
            >
              Sync NVD
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || statusQuery.data?.bdu.status === "running"}
              onClick={() => bduMutation.mutate()}
              data-testid="sync-bdu"
            >
              Sync BDU
            </Button>
            <div className="flex items-center gap-2">
              <input
                key={fileKey}
                type="file"
                accept=".xml,application/xml,text/xml"
                className="border-input bg-background h-7 max-w-[220px] rounded-md border px-2 text-xs"
                disabled={busy || statusQuery.data?.bdu.status === "running"}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadMutation.mutate(file);
                }}
              />
              <span className="text-muted-foreground text-xs">
                Upload BDU XML
              </span>
            </div>
          </div>
        </section>
      ) : (
        <p className="text-muted-foreground text-sm">
          Only admins can trigger sync or upload BDU XML.
        </p>
      )}
    </div>
  );
}
