"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AssetFormDialog } from "./asset-form-dialog";
import type { AssetDetail, AssetFormValues, ServiceItem } from "./types";

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

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AssetDetailClient({
  assetId,
  canMutate,
  canDelete,
}: {
  assetId: string;
  canMutate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [port, setPort] = useState("443");
  const [protocol, setProtocol] = useState("tcp");
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/assets/${assetId}`);
      if (!res.ok) {
        setError(await readError(res));
        setAsset(null);
        return;
      }
      setAsset((await res.json()) as AssetDetail);
    });
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveEdit(values: AssetFormValues) {
    const res = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
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
    load();
  }

  async function addService() {
    setServiceError(null);
    const res = await fetch(`/api/assets/${assetId}/services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        port: Number(port),
        protocol: protocol || "tcp",
      }),
    });
    if (!res.ok) {
      setServiceError(await readError(res));
      return;
    }
    load();
  }

  async function removeAsset() {
    if (!confirm("Delete this asset and its services?")) return;
    const res = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    router.push("/app/assets");
  }

  if (error && !asset) {
    return (
      <div className="space-y-2">
        <Link href="/app/assets" className="text-sm text-muted-foreground hover:underline">
          ← Assets
        </Link>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!asset) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const services: ServiceItem[] = asset.services ?? [];

  return (
    <div className="space-y-6" data-testid="asset-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/app/assets"
            className="text-xs text-muted-foreground hover:underline"
          >
            ← Assets
          </Link>
          <h1 className="text-lg font-semibold tracking-tight" data-testid="asset-detail-name">
            {asset.name}
          </h1>
          <p className="font-mono text-xs text-muted-foreground">
            {[asset.hostname, asset.ip].filter(Boolean).join(" · ") || "No host/IP"}
          </p>
        </div>
        <div className="flex gap-2">
          {canMutate ? (
            <Button
              size="sm"
              variant="outline"
              data-testid="asset-edit"
              onClick={() => setEditOpen(true)}
            >
              Edit
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              size="sm"
              variant="destructive"
              data-testid="asset-delete"
              onClick={() => void removeAsset()}
            >
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Metadata</h2>
        <dl className="grid max-w-xl grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Environment</dt>
          <dd>{asset.environment ?? "—"}</dd>
          <dt className="text-muted-foreground">Criticality</dt>
          <dd>{asset.criticality}</dd>
          <dt className="text-muted-foreground">Notes</dt>
          <dd className="whitespace-pre-wrap">{asset.notes ?? "—"}</dd>
          <dt className="text-muted-foreground">Updated</dt>
          <dd>{formatDate(asset.updatedAt)}</dd>
        </dl>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium">Services</h2>
            <p className="text-xs text-muted-foreground">
              Populated by nmap ingest; manual add supported for analysts.
            </p>
          </div>
        </div>

        {canMutate ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="svc-port">Port</Label>
              <Input
                id="svc-port"
                data-testid="service-port"
                className="w-24"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="svc-proto">Protocol</Label>
              <Input
                id="svc-proto"
                data-testid="service-protocol"
                className="w-24"
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              data-testid="service-add"
              disabled={pending}
              onClick={() => void addService()}
            >
              Add service
            </Button>
            {serviceError ? (
              <p className="text-sm text-destructive">{serviceError}</p>
            ) : null}
          </div>
        ) : null}

        <Table data-testid="services-table">
          <TableHeader>
            <TableRow>
              <TableHead>Port</TableHead>
              <TableHead>Protocol</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Last seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No services yet.
                </TableCell>
              </TableRow>
            ) : (
              services.map((s) => (
                <TableRow key={s.id} data-testid="service-row">
                  <TableCell className="font-mono">{s.port}</TableCell>
                  <TableCell>{s.protocol}</TableCell>
                  <TableCell>{s.name ?? "—"}</TableCell>
                  <TableCell>{s.product ?? "—"}</TableCell>
                  <TableCell>{s.version ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(s.lastSeenAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <AssetFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit asset"
        submitLabel="Save"
        initial={{
          name: asset.name,
          hostname: asset.hostname ?? "",
          ip: asset.ip ?? "",
          environment: asset.environment ?? "",
          criticality: asset.criticality,
          notes: asset.notes ?? "",
        }}
        onSubmit={saveEdit}
      />
    </div>
  );
}
