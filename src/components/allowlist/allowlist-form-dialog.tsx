"use client";

import { useEffect, useState } from "react";
import { targetsAllowed } from "@/lib/allowlist/matcher";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { AllowlistFormValues } from "./types";
import { EMPTY_ALLOWLIST_FORM } from "./types";

export function AllowlistFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial?: Partial<AllowlistFormValues>;
  submitLabel: string;
  onSubmit: (values: AllowlistFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<AllowlistFormValues>({
    ...EMPTY_ALLOWLIST_FORM,
    ...initial,
  });
  const [previewTarget, setPreviewTarget] = useState("10.10.0.5");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setValues({ ...EMPTY_ALLOWLIST_FORM, ...initial });
      setError(null);
    }
  }, [open, initial]);

  const preview =
    values.pattern.trim().length > 0
      ? targetsAllowed([previewTarget], [
          {
            pattern: values.pattern.trim(),
            patternType: values.patternType,
            enabled: values.enabled,
          },
        ])
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="allowlist-form-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            CIDR (e.g. 10.10.0.0/24) or URL prefix. Only enabled entries gate
            scans.
          </DialogDescription>
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
            <Label htmlFor="al-pattern">Pattern</Label>
            <Input
              id="al-pattern"
              data-testid="allowlist-pattern"
              required
              placeholder="10.10.0.0/24"
              value={values.pattern}
              onChange={(e) =>
                setValues((v) => ({ ...v, pattern: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="al-type">Type</Label>
            <select
              id="al-type"
              data-testid="allowlist-type"
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={values.patternType}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  patternType: e.target.value as "cidr" | "url",
                }))
              }
            >
              <option value="cidr">cidr</option>
              <option value="url">url</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              data-testid="allowlist-enabled"
              checked={values.enabled}
              onCheckedChange={(checked) =>
                setValues((v) => ({ ...v, enabled: Boolean(checked) }))
              }
            />
            Enabled
          </label>
          <div className="grid gap-1.5">
            <Label htmlFor="al-desc">Description</Label>
            <Textarea
              id="al-desc"
              data-testid="allowlist-description"
              value={values.description}
              onChange={(e) =>
                setValues((v) => ({ ...v, description: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-1.5 rounded-lg border border-border p-2">
            <Label htmlFor="al-preview">Matcher preview target</Label>
            <Input
              id="al-preview"
              data-testid="allowlist-preview-target"
              value={previewTarget}
              onChange={(e) => setPreviewTarget(e.target.value)}
            />
            {preview ? (
              <p
                className="text-xs"
                data-testid="allowlist-preview-result"
              >
                {preview.ok
                  ? "Would allow this target"
                  : `Would reject: ${preview.rejected.join(", ")}`}
              </p>
            ) : null}
          </div>
          {error ? (
            <p
              className="text-sm text-destructive"
              data-testid="allowlist-form-error"
            >
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
            <Button
              type="submit"
              disabled={pending}
              data-testid="allowlist-form-submit"
            >
              {pending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
