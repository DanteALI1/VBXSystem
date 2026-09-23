"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ScanCreateValues } from "./types";

export function ScanCreateDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ScanCreateValues) => Promise<void>;
}) {
  const [type, setType] = useState<"nmap" | "nuclei">("nmap");
  const [target, setTarget] = useState("");
  const [ports, setPorts] = useState("");
  const [templates, setTemplates] = useState("cves,vulnerabilities");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        type,
        target: target.trim(),
        ports: ports.trim() || undefined,
        templates: templates.trim() || undefined,
      });
      setTarget("");
      setPorts("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create scan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New scan</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="scan-type">Type</Label>
            <select
              id="scan-type"
              className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              value={type}
              onChange={(e) => setType(e.target.value as "nmap" | "nuclei")}
            >
              <option value="nmap">nmap</option>
              <option value="nuclei">nuclei (detection-only)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scan-target">Target</Label>
            <Input
              id="scan-target"
              required
              placeholder="10.0.0.5 or lab.example.local"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <p className="text-[11px] text-zinc-500">
              Must be covered by an enabled allowlist entry.
            </p>
          </div>
          {type === "nmap" ? (
            <div className="space-y-1.5">
              <Label htmlFor="scan-ports">Ports (optional)</Label>
              <Input
                id="scan-ports"
                placeholder="22,80,443"
                value={ports}
                onChange={(e) => setPorts(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="scan-templates">Templates</Label>
              <Input
                id="scan-templates"
                value={templates}
                onChange={(e) => setTemplates(e.target.value)}
              />
              <p className="text-[11px] text-zinc-500">
                Detection-only: cves/ and vulnerabilities/. Exploit/RCE paths
                are rejected.
              </p>
            </div>
          )}
          {error ? (
            <p className="text-sm text-red-600" role="alert">
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
            <Button type="submit" disabled={saving}>
              {saving ? "Enqueueing…" : "Enqueue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
