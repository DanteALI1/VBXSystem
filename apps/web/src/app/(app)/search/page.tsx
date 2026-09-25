"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Play, X } from "lucide-react";
import { api, apiDownload } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatDate } from "@/lib/severity";
import {
  ActiveFilter,
  FILTER_DEFS,
  composeCveql,
  makeFilter,
} from "@/components/search/filterTypes";
import { FilterBar } from "@/components/search/FilterBar";
import { FIELD_LABELS } from "@/components/search/fieldLabels";
import {
  SearchHit,
  TableViewState,
  defaultViewState,
  loadViewState,
  saveViewState,
} from "@/components/search/columnCatalog";
import { ColumnViewEditor } from "@/components/search/ColumnViewEditor";
import { ResultsTable } from "@/components/search/ResultsTable";

type ExecOut = {
  query: string;
  total: number;
  limit: number;
  offset: number;
  results: SearchHit[];
  fields: string[];
};

const PAGE_SIZE = 50;

function SearchWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [filters, setFilters] = useState<ActiveFilter[]>(() => {
    const q = params.get("query");
    if (q) return [];
    const init = makeFilter("severity", { value: "CRITICAL" });
    return init ? [init] : [];
  });
  const [query, setQuery] = useState(
    () =>
      params.get("query") ||
      composeCveql([{ id: "init", field: "severity", op: "=", value: "CRITICAL" }]),
  );
  const [showQuery, setShowQuery] = useState(false);
  const [data, setData] = useState<ExecOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<SearchHit | null>(null);
  const [view, setView] = useState<TableViewState>(() => defaultViewState());

  useEffect(() => {
    setView(loadViewState());
  }, []);

  function updateView(next: TableViewState) {
    setView(next);
    saveViewState(next);
  }

  const syncUrl = useCallback(
    (q: string) => {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("query", q.trim());
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const run = useCallback(
    async (q: string, nextOffset = 0) => {
      setBusy(true);
      setErr(null);
      try {
        const res = await api<ExecOut>("/cveql/execute", {
          method: "POST",
          body: JSON.stringify({ query: q, limit: PAGE_SIZE, offset: nextOffset }),
        });
        setData(res);
        setOffset(nextOffset);
        setQuery(q);
        syncUrl(q);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Ошибка");
        setData(null);
      } finally {
        setBusy(false);
      }
    },
    [syncUrl],
  );

  useEffect(() => {
    run(query, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(next: ActiveFilter[]) {
    setFilters(next);
    const q = composeCveql(next);
    setQuery(q);
    run(q, 0);
  }

  function onSubmitQuery(e: FormEvent) {
    e.preventDefault();
    run(query, 0);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-3" data-testid="search-page">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="font-display text-lg font-semibold tracking-tight">
            Security Vulnerability Database
          </h1>
          <span className="text-xs text-muted">
            {data?.total ?? "—"} совпадений
          </span>
        </div>
        <Link
          href="/local/new"
          className="text-xs font-medium text-accent2 hover:underline"
        >
          + Локальная запись
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-surface2/40">
        <form
          onSubmit={onSubmitQuery}
          className="flex items-center gap-1.5 border-b border-border px-2 py-1"
        >
          <span className="shrink-0 select-none px-1 text-[10px] font-medium uppercase tracking-wider text-muted">
            CVEQL
          </span>
          <input
            className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-xs outline-none placeholder:text-muted/60"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            aria-label="CVEQL запрос"
            data-testid="cveql-editor"
            placeholder='severity = "CRITICAL" and cvss_score >= 9'
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-accent px-2 text-xs font-medium text-white hover:bg-accent2 disabled:opacity-50"
            title="Выполнить"
          >
            <Play size={12} />
            {busy ? "…" : "Найти"}
          </button>
          <button
            type="button"
            className="inline-flex h-7 shrink-0 items-center rounded-md px-1.5 text-xs text-muted hover:bg-surface hover:text-text"
            onClick={() => setShowQuery((v) => !v)}
            title="Справка CVEQL"
          >
            ?
          </button>
        </form>

        {showQuery && (
          <div className="border-b border-border px-3 py-2 text-[11px] leading-relaxed text-muted">
            Поля: {FILTER_DEFS.map((d) => d.field).join(", ")}. Операторы: = != &gt; &gt;= &lt; &lt;= ~
            in and or. AND сильнее OR. Между чипами — AND / OR.
          </div>
        )}

        <div className="px-2 py-1.5">
          <FilterBar
            layout="bar"
            filters={filters}
            onChange={setFilters}
            onApply={applyFilters}
            showPreview
          />
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        {err && (
          <Card className="border-danger/40 text-sm text-danger" role="alert" data-testid="cveql-error">
            {err}
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <span>
            Результатов: <span className="text-text">{data?.total ?? "—"}</span>
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!query.trim() || busy}
              onClick={() => {
                void apiDownload("/cveql/export", {
                  method: "POST",
                  body: JSON.stringify({ query, limit: 2000 }),
                  filename: "cveql-export.csv",
                }).catch((e) => setErr(e instanceof Error ? e.message : "Ошибка экспорта"));
              }}
              title="Экспорт CSV (до 2000 строк)"
            >
              <Download size={14} />
              CSV
            </Button>
            <span className="font-mono text-xs">{data?.query}</span>
            <ColumnViewEditor view={view} onChange={updateView} />
          </div>
        </div>

        <ResultsTable
          rows={data?.results || []}
          view={view}
          onChange={updateView}
          selectedId={selected?.id}
          onSelect={setSelected}
          empty={Boolean(data && !data.results.length && !busy)}
        />

        {data && totalPages > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={offset <= 0 || busy}
              onClick={() => run(query, Math.max(0, offset - PAGE_SIZE))}
            >
              Назад
            </Button>
            <span className="text-sm text-muted">
              Стр. {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={offset + PAGE_SIZE >= data.total || busy}
              onClick={() => run(query, offset + PAGE_SIZE)}
            >
              Вперёд
            </Button>
            <span className="text-xs text-muted">по {PAGE_SIZE} записей</span>
          </div>
        )}
      </div>

      {selected && (
        <Card className="space-y-3" data-testid="search-detail">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">{selected.id}</h2>
              <p className="mt-1 text-sm text-muted">{selected.title || selected.description}</p>
            </div>
            <div className="flex gap-2">
              <Link href={selected.href} className="text-sm text-accent2 hover:underline">
                Открыть карточку
              </Link>
              <button
                type="button"
                className="text-muted hover:text-text"
                onClick={() => setSelected(null)}
                aria-label="Закрыть"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="grid gap-2 text-sm md:grid-cols-3">
            <div>
              <span className="text-muted">{FIELD_LABELS["affected.app"]}: </span>
              {selected.affected_app || (selected.affected_apps || []).join(", ") || "—"}
            </div>
            <div>
              <span className="text-muted">{FIELD_LABELS["affected.os"]}: </span>
              {selected.affected_os || (selected.affected_oses || []).join(", ") || "—"}
            </div>
            <div>
              <span className="text-muted">{FIELD_LABELS["affected.version"]}: </span>
              {selected.affected_version ||
                (selected.affected_versions || []).join("; ") ||
                "—"}
            </div>
            <div>
              <span className="text-muted">{FIELD_LABELS.severity}: </span>
              {selected.severity || "—"}
            </div>
            <div>
              <span className="text-muted">{FIELD_LABELS.cvss_score}: </span>
              {selected.cvss_score ?? "—"} {selected.cvss_vector}
            </div>
            <div>
              <span className="text-muted">{FIELD_LABELS["epss_scores.score"]}: </span>
              {selected.epss_score != null ? (selected.epss_score * 100).toFixed(2) + "%" : "—"}
            </div>
            <div>
              <span className="text-muted">{FIELD_LABELS.published}: </span>
              {formatDate(selected.published)}
            </div>
            <div>
              <span className="text-muted">{FIELD_LABELS.modified}: </span>
              {formatDate(selected.modified)}
            </div>
            <div>
              <span className="text-muted">{FIELD_LABELS.source}: </span>
              {selected.source || "—"}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Загрузка…</div>}>
      <SearchWorkspace />
    </Suspense>
  );
}
