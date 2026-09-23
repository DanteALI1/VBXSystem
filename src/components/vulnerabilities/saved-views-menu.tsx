"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogFilters } from "./types";

type SavedViewItem = {
  id: string;
  name: string;
  q?: string;
  filters?: Record<string, unknown>;
  sort?: string;
  order?: string;
};

export function SavedViewsMenu({
  q,
  filters,
  sort,
  order,
  onLoad,
}: {
  q: string;
  filters: CatalogFilters;
  sort: string;
  order: string;
  onLoad: (view: {
    q: string;
    filters: CatalogFilters;
    sort: string;
    order: string;
  }) => void;
}) {
  const [items, setItems] = useState<SavedViewItem[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/saved-views?scope=vulnerabilities");
    if (!res.ok) return;
    const data = (await res.json()) as { items: SavedViewItem[] };
    setItems(data.items);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          q,
          filters,
          sort,
          order,
          scope: "vulnerabilities",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Failed to save view");
        return;
      }
      setName("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/saved-views/${id}`, { method: "DELETE" });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function load(view: SavedViewItem) {
    const f = (view.filters ?? {}) as Partial<CatalogFilters>;
    onLoad({
      q: view.q ?? "",
      filters: {
        severity: Array.isArray(f.severity) ? f.severity : [],
        source: Array.isArray(f.source) ? f.source : [],
        kev: (f.kev as CatalogFilters["kev"]) ?? "",
        cvssMin: typeof f.cvssMin === "string" ? f.cvssMin : "",
        cvssMax: typeof f.cvssMax === "string" ? f.cvssMax : "",
        vendor: typeof f.vendor === "string" ? f.vendor : "",
        product: typeof f.product === "string" ? f.product : "",
        tag: typeof f.tag === "string" ? f.tag : "",
        updatedFrom: typeof f.updatedFrom === "string" ? f.updatedFrom : "",
        updatedTo: typeof f.updatedTo === "string" ? f.updatedTo : "",
      },
      sort: view.sort ?? "updated",
      order: view.order ?? "desc",
    });
  }

  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="saved-views">
      <p className="text-sm font-medium">Saved views</p>
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="View name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          disabled={!name.trim() || busy}
          onClick={() => void save()}
        >
          Save
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <ul className="space-y-1">
        {items.length === 0 && (
          <li className="text-xs text-muted-foreground">No saved views yet</li>
        )}
        {items.map((v) => (
          <li
            key={v.id}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <button
              type="button"
              className="truncate text-left hover:underline"
              onClick={() => load(v)}
            >
              {v.name}
            </button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={busy}
              onClick={() => void remove(v.id)}
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
