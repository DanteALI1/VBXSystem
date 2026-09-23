"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { createScanSchema } from "@/lib/scans/schemas";

type FormValues = {
  type: "nmap" | "nuclei" | "zap" | "openvas";
  target: string;
  fixture: boolean;
};

export function CreateScanDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<FormValues>({
    defaultValues: {
      type: "nmap",
      target: "10.0.1.10",
      fixture: true,
    },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const payload = createScanSchema.parse({
        type: values.type,
        target: values.target,
        options: values.fixture ? { fixture: true } : {},
      });
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        id?: string;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      toast.success(`Scan queued (${data?.id?.slice(0, 8) ?? "ok"})`);
      onOpenChange(false);
      form.reset({
        type: "nmap",
        target: "10.0.1.10",
        fixture: true,
      });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create scan failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="create-scan-dialog">
        <DialogHeader>
          <DialogTitle>New scan</DialogTitle>
          <DialogDescription>
            Target must match an enabled allowlist rule. Fixture mode uses
            bundled sample reports when binaries are unavailable.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-1.5">
            <Label htmlFor="scan-type">Scanner</Label>
            <select
              id="scan-type"
              data-testid="scan-type"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              {...form.register("type")}
            >
              <option value="nmap">nmap</option>
              <option value="nuclei">nuclei</option>
              <option value="zap">zap (stub)</option>
              <option value="openvas">openvas (stub)</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="scan-target">Target</Label>
            <Input
              id="scan-target"
              data-testid="scan-target"
              autoComplete="off"
              placeholder="10.0.1.10 or https://app.lab.local"
              {...form.register("target", { required: "target is required" })}
            />
            {form.formState.errors.target ? (
              <p className="text-destructive text-xs">
                {form.formState.errors.target.message}
              </p>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="scan-fixture"
              className="size-4"
              {...form.register("fixture")}
            />
            Use fixture mode (no real binary)
          </label>
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
              data-testid="scan-submit"
              disabled={submitting}
            >
              {submitting ? "Queuing…" : "Queue scan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
