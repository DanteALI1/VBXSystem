"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AllowlistListItem } from "@/lib/allowlist/types";

type FormValues = {
  pattern: string;
  type: "cidr" | "url";
  enabled: boolean;
  description: string;
};

export function AllowlistFormDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: AllowlistListItem | null;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = Boolean(item);

  const form = useForm<FormValues>({
    defaultValues: {
      pattern: "",
      type: "cidr",
      enabled: true,
      description: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      pattern: item?.pattern ?? "",
      type: item?.type ?? "cidr",
      enabled: item?.enabled ?? true,
      description: item?.description ?? "",
    });
  }, [open, item, form]);

  const ruleType = useWatch({ control: form.control, name: "type" });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const payload = {
        pattern: values.pattern.trim(),
        type: values.type,
        enabled: values.enabled,
        description: values.description.trim() || null,
      };
      const url = isEdit ? `/api/allowlist/${item!.id}` : "/api/allowlist";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          details?: { fieldErrors?: Record<string, string[]> };
        } | null;
        const fieldMsg = data?.details?.fieldErrors?.pattern?.[0];
        throw new Error(
          fieldMsg ?? data?.error ?? `Request failed (${res.status})`,
        );
      }
      toast.success(isEdit ? "Rule updated" : "Rule created");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="allowlist-form-dialog">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit allowlist rule" : "New allowlist rule"}
          </DialogTitle>
          <DialogDescription>
            CIDR (e.g. 10.0.0.0/8) or URL/host pattern. Only enabled rules gate
            scans.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-1.5">
            <Label htmlFor="allowlist-type">Type</Label>
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) =>
                    field.onChange((v as "cidr" | "url") ?? "cidr")
                  }
                >
                  <SelectTrigger
                    id="allowlist-type"
                    className="w-full"
                    data-testid="allowlist-type"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cidr">CIDR</SelectItem>
                    <SelectItem value="url">URL</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="allowlist-pattern">Pattern</Label>
            <Input
              id="allowlist-pattern"
              data-testid="allowlist-pattern"
              autoComplete="off"
              placeholder={
                ruleType === "cidr"
                  ? "10.0.0.0/8"
                  : "https://app.example.com/api"
              }
              {...form.register("pattern", { required: true })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="allowlist-enabled">Enabled</Label>
            <Controller
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <Select
                  value={field.value ? "true" : "false"}
                  onValueChange={(v) => field.onChange(v === "true")}
                >
                  <SelectTrigger
                    id="allowlist-enabled"
                    className="w-full"
                    data-testid="allowlist-enabled"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="allowlist-description">Description</Label>
            <Textarea
              id="allowlist-description"
              data-testid="allowlist-description"
              rows={2}
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
            <Button
              type="submit"
              data-testid="allowlist-save"
              disabled={submitting}
            >
              {submitting ? "Saving…" : isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
