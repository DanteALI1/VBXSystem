"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SEVERITIES, VULN_SOURCES } from "@/lib/vulnerabilities/types";

function SearchField({
  initialQ,
  onCommit,
}: {
  initialQ: string;
  onCommit: (q: string) => void;
}) {
  const [q, setQ] = useState(initialQ);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (q === initialQ) return;
      onCommit(q.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [q, initialQ, onCommit]);

  return (
    <div className="min-w-[220px] flex-1 space-y-1">
      <Label htmlFor="vuln-q" className="text-xs text-muted-foreground">
        Search
      </Label>
      <Input
        id="vuln-q"
        value={q}
        placeholder="Title, CVE, BDU…"
        onChange={(e) => setQ(e.target.value)}
        className="h-8"
        data-testid="vuln-search"
      />
    </div>
  );
}

export function VulnerabilitiesFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const qParam = searchParams.get("q") ?? "";
  const severityParam = searchParams.get("severity") ?? "";
  const sourceParam = searchParams.get("source") ?? "";

  const pushParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === "" || value === "all") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      next.delete("page");
      startTransition(() => {
        const qs = next.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [pathname, router, searchParams],
  );

  const commitSearch = useCallback(
    (q: string) => {
      pushParams({ q: q || null });
    },
    [pushParams],
  );

  return (
    <div
      className="flex flex-wrap items-end gap-3"
      data-testid="vuln-filters"
      data-pending={isPending ? "true" : undefined}
    >
      <SearchField
        key={qParam}
        initialQ={qParam}
        onCommit={commitSearch}
      />

      <div className="w-[160px] space-y-1">
        <Label className="text-xs text-muted-foreground">Severity</Label>
        <Select
          value={severityParam || "all"}
          onValueChange={(value) =>
            pushParams({ severity: value === "all" ? null : (value ?? null) })
          }
        >
          <SelectTrigger
            className="w-full"
            size="sm"
            data-testid="vuln-severity-filter"
          >
            <SelectValue placeholder="All severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {SEVERITIES.map((s) => (
              <SelectItem key={s} value={s} data-testid={`vuln-severity-${s}`}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-[140px] space-y-1">
        <Label className="text-xs text-muted-foreground">Source</Label>
        <Select
          value={sourceParam || "all"}
          onValueChange={(value) =>
            pushParams({ source: value === "all" ? null : (value ?? null) })
          }
        >
          <SelectTrigger
            className="w-full"
            size="sm"
            data-testid="vuln-source-filter"
          >
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {VULN_SOURCES.map((s) => (
              <SelectItem key={s} value={s} data-testid={`vuln-source-${s}`}>
                {s.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
