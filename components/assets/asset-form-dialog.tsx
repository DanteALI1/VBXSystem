"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createAssetSchema,
  type CreateAssetInput,
} from "@/lib/assets/schemas";
import type { AssetListItem } from "@/lib/assets/types";

type FormValues = {
  hostname: string;
  ip: string;
  description?: string | null;
};

export function AssetFormDialog({
  open,
  onOpenChange,
  asset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: AssetListItem | null;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = Boolean(asset);

  const form = useForm<FormValues>({
    resolver: zodResolver(createAssetSchema),
    defaultValues: {
      hostname: "",
      ip: "",
      description: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      hostname: asset?.hostname ?? "",
      ip: asset?.ip ?? "",
      description: asset?.description ?? "",
    });
  }, [open, asset, form]);

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const payload: CreateAssetInput = createAssetSchema.parse(values);
      const url = isEdit ? `/api/assets/${asset!.id}` : "/api/assets";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      toast.success(isEdit ? "Asset updated" : "Asset created");
      onOpenChange(false);
      form.reset();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="asset-form-dialog">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit asset" : "New asset"}</DialogTitle>
          <DialogDescription>
            Hostname and IPv4 are required. Description is optional.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-1.5">
            <Label htmlFor="asset-hostname">Hostname</Label>
            <Input
              id="asset-hostname"
              data-testid="asset-hostname"
              autoComplete="off"
              {...form.register("hostname")}
            />
            {form.formState.errors.hostname ? (
              <p className="text-destructive text-xs">
                {form.formState.errors.hostname.message}
              </p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="asset-ip">IP</Label>
            <Input
              id="asset-ip"
              data-testid="asset-ip"
              autoComplete="off"
              placeholder="10.0.0.1"
              {...form.register("ip")}
            />
            {form.formState.errors.ip ? (
              <p className="text-destructive text-xs">
                {form.formState.errors.ip.message}
              </p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="asset-description">Description</Label>
            <Textarea
              id="asset-description"
              data-testid="asset-description"
              rows={3}
              {...form.register("description")}
            />
          </div>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" data-testid="asset-save" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
