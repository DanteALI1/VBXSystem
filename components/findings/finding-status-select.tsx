"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FindingStatus } from "@/db/schema";
import type { AppRole } from "@/lib/auth/roles";
import { allowedFindingStatuses } from "@/lib/findings/transitions";
import type { FindingListItem } from "@/lib/findings/types";

export function FindingStatusSelect({
  finding,
  role,
}: {
  finding: FindingListItem;
  role: AppRole;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<FindingStatus>(finding.status);

  const allowed = allowedFindingStatuses(status, role);
  const options: FindingStatus[] = [
    status,
    ...allowed.filter((s) => s !== status),
  ];

  async function changeStatus(next: FindingStatus | null) {
    if (!next || next === status) return;
    const previous = status;
    setStatus(next);
    setPending(true);
    try {
      const res = await fetch(`/api/findings/${finding.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `Update failed (${res.status})`);
      }
      const updated = (await res.json()) as FindingListItem;
      setStatus(updated.status);
      toast.success(`Status → ${updated.status}`);
      router.refresh();
    } catch (err) {
      setStatus(previous);
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Select
      value={status}
      disabled={pending || allowed.length === 0}
      onValueChange={(value) => void changeStatus(value as FindingStatus | null)}
    >
      <SelectTrigger
        size="sm"
        className="h-7 w-[140px] font-mono text-[11px]"
        data-testid="finding-status-select"
        data-finding-id={finding.id}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((s) => (
          <SelectItem
            key={s}
            value={s}
            data-testid={`finding-status-option-${s}`}
          >
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
