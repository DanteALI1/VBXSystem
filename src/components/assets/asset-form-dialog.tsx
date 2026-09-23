"use client";

import { useState } from "react";
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
import type { AssetFormValues } from "./types";
import { EMPTY_ASSET_FORM } from "./types";

export function AssetFormDialog({
  open,
  onOpenChange,
  title,
  description,
  initial,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initial?: Partial<AssetFormValues>;
  submitLabel: string;
  onSubmit: (values: AssetFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<AssetFormValues>({
    ...EMPTY_ASSET_FORM,
    ...initial,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reset(next?: Partial<AssetFormValues>) {
    setValues({ ...EMPTY_ASSET_FORM, ...next });
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset(initial);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" data-testid="asset-form-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setPending(true);
            setError(null);
            void onSubmit(values)
              .then(() => onOpenChange(false))
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Request failed");
              })
              .finally(() => setPending(false));
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="asset-name">Name</Label>
            <Input
              id="asset-name"
              data-testid="asset-name"
              required
              value={values.name}
              onChange={(e) =>
                setValues((v) => ({ ...v, name: e.target.value }))
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="asset-ip">IP</Label>
              <Input
                id="asset-ip"
                data-testid="asset-ip"
                placeholder="10.0.0.1"
                value={values.ip}
                onChange={(e) =>
                  setValues((v) => ({ ...v, ip: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="asset-hostname">Hostname</Label>
              <Input
                id="asset-hostname"
                data-testid="asset-hostname"
                value={values.hostname}
                onChange={(e) =>
                  setValues((v) => ({ ...v, hostname: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="asset-environment">Environment</Label>
              <Input
                id="asset-environment"
                data-testid="asset-environment"
                placeholder="lab / prod"
                value={values.environment}
                onChange={(e) =>
                  setValues((v) => ({ ...v, environment: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="asset-criticality">Criticality (1–5)</Label>
              <Input
                id="asset-criticality"
                data-testid="asset-criticality"
                type="number"
                min={1}
                max={5}
                value={values.criticality}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    criticality: Number(e.target.value) || 3,
                  }))
                }
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="asset-notes">Notes</Label>
            <Textarea
              id="asset-notes"
              data-testid="asset-notes"
              value={values.notes}
              onChange={(e) =>
                setValues((v) => ({ ...v, notes: e.target.value }))
              }
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" data-testid="asset-form-error">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending} data-testid="asset-form-submit">
              {pending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
