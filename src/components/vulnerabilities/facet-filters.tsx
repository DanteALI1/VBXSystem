"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CatalogFilters } from "./types";

const SEVERITIES = ["critical", "high", "medium", "low", "none"] as const;

export function FacetFilters({
  filters,
  onChange,
  tagOptions,
}: {
  filters: CatalogFilters;
  onChange: (next: CatalogFilters) => void;
  tagOptions: string[];
}) {
  function toggleSeverity(s: string) {
    const set = new Set(filters.severity);
    if (set.has(s)) set.delete(s);
    else set.add(s);
    onChange({ ...filters, severity: [...set] });
  }

  function toggleSource(s: string) {
    const set = new Set(filters.source);
    if (set.has(s)) set.delete(s);
    else set.add(s);
    onChange({ ...filters, source: [...set] });
  }

  return (
    <div className="space-y-3" data-testid="facet-filters">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Severity
        </span>
        {SEVERITIES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggleSeverity(s)}
            className="focus-visible:outline-none"
          >
            <Badge
              variant={filters.severity.includes(s) ? "default" : "outline"}
              className="cursor-pointer capitalize"
            >
              {s}
            </Badge>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Source</span>
        {(["nvd", "bdu"] as const).map((s) => (
          <button key={s} type="button" onClick={() => toggleSource(s)}>
            <Badge
              variant={filters.source.includes(s) ? "default" : "outline"}
              className="cursor-pointer uppercase"
            >
              {s}
            </Badge>
          </button>
        ))}
        <span className="text-xs font-medium text-muted-foreground">KEV</span>
        {(["", "true", "false"] as const).map((v) => (
          <button
            key={v || "any"}
            type="button"
            onClick={() => onChange({ ...filters, kev: v })}
          >
            <Badge
              variant={filters.kev === v ? "default" : "outline"}
              className="cursor-pointer"
            >
              {v === "" ? "any" : v === "true" ? "KEV" : "not KEV"}
            </Badge>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
        <div>
          <Label className="text-xs">CVSS min</Label>
          <Input
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={filters.cvssMin}
            onChange={(e) => onChange({ ...filters, cvssMin: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">CVSS max</Label>
          <Input
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={filters.cvssMax}
            onChange={(e) => onChange({ ...filters, cvssMax: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Vendor</Label>
          <Input
            value={filters.vendor}
            onChange={(e) => onChange({ ...filters, vendor: e.target.value })}
            placeholder="vendor"
          />
        </div>
        <div>
          <Label className="text-xs">Product</Label>
          <Input
            value={filters.product}
            onChange={(e) => onChange({ ...filters, product: e.target.value })}
            placeholder="product"
          />
        </div>
        <div>
          <Label className="text-xs">Tag</Label>
          <Input
            list="vuln-tag-options"
            value={filters.tag}
            onChange={(e) => onChange({ ...filters, tag: e.target.value })}
            placeholder="tag"
          />
          <datalist id="vuln-tag-options">
            {tagOptions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div>
          <Label className="text-xs">Updated from</Label>
          <Input
            type="date"
            value={filters.updatedFrom}
            onChange={(e) =>
              onChange({ ...filters, updatedFrom: e.target.value })
            }
          />
        </div>
        <div>
          <Label className="text-xs">Updated to</Label>
          <Input
            type="date"
            value={filters.updatedTo}
            onChange={(e) =>
              onChange({ ...filters, updatedTo: e.target.value })
            }
          />
        </div>
      </div>

      <Button
        type="button"
        size="xs"
        variant="ghost"
        onClick={() =>
          onChange({
            severity: [],
            source: [],
            kev: "",
            cvssMin: "",
            cvssMax: "",
            vendor: "",
            product: "",
            tag: "",
            updatedFrom: "",
            updatedTo: "",
          })
        }
      >
        Clear facets
      </Button>
    </div>
  );
}
