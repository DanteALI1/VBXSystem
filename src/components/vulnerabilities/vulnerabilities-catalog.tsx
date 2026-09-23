"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VulnSortField } from "@/lib/search/constants";
import { FacetFilters } from "./facet-filters";
import { QueryBuilder } from "./query-builder";
import { SavedViewsMenu } from "./saved-views-menu";
import {
  EMPTY_FILTERS,
  type CatalogFilters,
  type VulnListResponse,
} from "./types";
import { VulnerabilitiesTable } from "./vulnerabilities-table";

function buildSearchParams(opts: {
  q: string;
  keyword: string;
  filters: CatalogFilters;
  sort: string;
  order: string;
  page: number;
  pageSize: number;
}): URLSearchParams {
  const sp = new URLSearchParams();
  if (opts.q.trim()) sp.set("q", opts.q.trim());
  if (opts.keyword.trim()) sp.set("keyword", opts.keyword.trim());
  if (opts.filters.severity.length) {
    sp.set("severity", opts.filters.severity.join(","));
  }
  if (opts.filters.source.length) {
    sp.set("source", opts.filters.source.join(","));
  }
  if (opts.filters.kev) sp.set("kev", opts.filters.kev);
  if (opts.filters.cvssMin) sp.set("cvssMin", opts.filters.cvssMin);
  if (opts.filters.cvssMax) sp.set("cvssMax", opts.filters.cvssMax);
  if (opts.filters.vendor.trim()) sp.set("vendor", opts.filters.vendor.trim());
  if (opts.filters.product.trim()) {
    sp.set("product", opts.filters.product.trim());
  }
  if (opts.filters.tag.trim()) sp.set("tag", opts.filters.tag.trim());
  if (opts.filters.updatedFrom) {
    sp.set("updatedFrom", opts.filters.updatedFrom);
  }
  if (opts.filters.updatedTo) sp.set("updatedTo", opts.filters.updatedTo);
  sp.set("sort", opts.sort);
  sp.set("order", opts.order);
  sp.set("page", String(opts.page));
  sp.set("pageSize", String(opts.pageSize));
  return sp;
}

export function VulnerabilitiesCatalog() {
  const [keyword, setKeyword] = useState("");
  const [q, setQ] = useState("");
  const [advancedMode, setAdvancedMode] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showViews, setShowViews] = useState(false);
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<VulnSortField>("updated");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [data, setData] = useState<VulnListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const fetchList = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const sp = buildSearchParams({
        q: advancedMode ? q : "",
        keyword: advancedMode ? "" : keyword,
        filters,
        sort,
        order,
        page,
        pageSize,
      });
      const res = await fetch(`/api/vulnerabilities?${sp.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Failed to load");
        setData(null);
        return;
      }
      setData(json as VulnListResponse);
    });
  }, [advancedMode, q, keyword, filters, sort, order, page, pageSize]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    void fetch("/api/tags")
      .then((r) => r.json())
      .then((d: { items: { name: string }[] }) =>
        setTagOptions(d.items.map((t) => t.name)),
      )
      .catch(() => undefined);
  }, []);

  function handleSort(field: VulnSortField) {
    if (sort === field) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setOrder(field === "cveId" ? "asc" : "desc");
    }
    setPage(1);
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Vulnerabilities
        </h1>
        <p className="text-sm text-muted-foreground" data-testid="vuln-count">
          {total} vulnerabilities found
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          className="flex-1"
          placeholder={
            advancedMode
              ? "Advanced query e.g. severity:critical kev:true"
              : "Keyword search…"
          }
          value={advancedMode ? q : keyword}
          onChange={(e) => {
            if (advancedMode) setQ(e.target.value);
            else setKeyword(e.target.value);
            setPage(1);
          }}
          data-testid="vuln-search"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={advancedMode ? "default" : "outline"}
            onClick={() => setAdvancedMode((v) => !v)}
          >
            Advanced query
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowBuilder((v) => !v)}
          >
            Query Builder
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowViews((v) => !v)}
          >
            Saved views
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void fetchList()}
            disabled={pending}
          >
            Search
          </Button>
        </div>
      </div>

      {showBuilder && (
        <QueryBuilder
          onApply={(query) => {
            setAdvancedMode(true);
            setQ(query);
            setPage(1);
            setShowBuilder(false);
          }}
          onClose={() => setShowBuilder(false)}
        />
      )}

      {showViews && (
        <SavedViewsMenu
          q={advancedMode ? q : keyword}
          filters={filters}
          sort={sort}
          order={order}
          onLoad={(view) => {
            setAdvancedMode(Boolean(view.q.includes(":")));
            setQ(view.q);
            setKeyword(view.q.includes(":") ? "" : view.q);
            setFilters(view.filters);
            setSort(view.sort as VulnSortField);
            setOrder(view.order === "asc" ? "asc" : "desc");
            setPage(1);
          }}
        />
      )}

      <FacetFilters
        filters={filters}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
        tagOptions={tagOptions}
      />

      {error && (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          data-testid="search-error"
          role="alert"
        >
          {error}
        </div>
      )}

      <VulnerabilitiesTable
        items={data?.items ?? []}
        sort={sort}
        order={order}
        onSort={handleSort}
      />

      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          Page {page} of {totalPages}
          {pending ? " · loading…" : ""}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
