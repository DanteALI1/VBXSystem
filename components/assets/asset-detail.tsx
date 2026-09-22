"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import type { AssetDetail } from "@/lib/assets/types";
import { AssetFormDialog } from "./asset-form-dialog";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[120px_1fr] sm:items-start">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function AssetDetailView({
  asset,
  canWrite,
}: {
  asset: AssetDetail;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (
      !confirm(
        "Delete this asset? Related services and findings will be removed.",
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `Delete failed (${res.status})`);
      }
      toast.success("Asset deleted");
      router.push("/app/assets");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="asset-detail">
      <div className="space-y-2">
        <Link
          href="/app/assets"
          className="text-muted-foreground text-xs underline-offset-2 hover:underline"
        >
          ← Assets
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1
              className="text-xl font-semibold tracking-tight"
              data-testid="asset-detail-hostname"
            >
              {asset.hostname}
            </h1>
            <p className="text-muted-foreground font-mono text-sm">
              {asset.ip}
            </p>
          </div>
          {canWrite ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                data-testid="asset-detail-edit"
                onClick={() => setEditOpen(true)}
              >
                Edit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                data-testid="asset-detail-delete"
                disabled={deleting}
                onClick={() => void handleDelete()}
              >
                Delete
              </Button>
            </div>
          ) : null}
        </div>
        {asset.description ? (
          <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed">
            {asset.description}
          </p>
        ) : null}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Details</h2>
        <dl className="space-y-2 border-t pt-3">
          <Field label="Hostname">
            <span className="font-mono text-sm">{asset.hostname}</span>
          </Field>
          <Field label="IP">
            <span className="font-mono text-sm" data-testid="asset-detail-ip">
              {asset.ip}
            </span>
          </Field>
          <Field label="Created">
            <span className="font-mono text-xs">
              {new Date(asset.createdAt).toISOString()}
            </span>
          </Field>
          <Field label="Updated">
            <span className="font-mono text-xs">
              {new Date(asset.updatedAt).toISOString()}
            </span>
          </Field>
        </dl>
      </section>

      <section className="space-y-3" data-testid="asset-services">
        <div>
          <h2 className="text-sm font-semibold">Services</h2>
          <p className="text-muted-foreground text-xs">
            Populated by scans (nmap). Empty until Wave 3 discovery runs.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8 text-xs">Port</TableHead>
              <TableHead className="h-8 text-xs">Protocol</TableHead>
              <TableHead className="h-8 text-xs">Name</TableHead>
              <TableHead className="h-8 text-xs">Product</TableHead>
              <TableHead className="h-8 text-xs">Version</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {asset.services.length === 0 ? (
              <TableRow data-testid="asset-services-empty">
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground h-16 text-center text-sm"
                >
                  No services discovered yet.
                </TableCell>
              </TableRow>
            ) : (
              asset.services.map((svc) => (
                <TableRow key={svc.id} className="h-9" data-testid="asset-service-row">
                  <TableCell className="font-mono text-xs">{svc.port}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {svc.protocol}
                  </TableCell>
                  <TableCell className="text-sm">{svc.name ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {svc.product ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {svc.version ?? "—"}
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
        asset={asset}
      />
    </div>
  );
}
