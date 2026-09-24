"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Search as SearchIcon, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatDate, formatEpss, severityTone } from "@/lib/severity";

type SearchHit = {
  kind: string;
  id: string;
  title: string;
  description: string;
  severity: string;
  cvss_score?: number | null;
  published_at?: string | null;
  is_cisa_kev: boolean;
  has_bdu: boolean;
  epss?: { score?: number; percentile?: number } | null;
  href: string;
};

type SearchResponse = {
  total: number;
  page: number;
  page_size: number;
  results: SearchHit[];
};

const SEVERITIES = ["", "CRITICAL", "HIGH", "MEDIUM", "LOW"];
const DATE_PRESETS = [
  { value: "", label: "Любая дата" },
  { value: "today", label: "Сегодня" },
  { value: "yesterday", label: "Вчера" },
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "this_week", label: "Эта неделя" },
  { value: "last_week", label: "Прошлая неделя" },
];

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState("");
  const [kev, setKev] = useState(false);
  const [hasBdu, setHasBdu] = useState(false);
  const [datePreset, setDatePreset] = useState("");
  const [sort, setSort] = useState("published");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const runSearch = useCallback(
    async (pageNum = 1) => {
      setLoading(true);
      setErr(null);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (severity) params.set("severity", severity);
        if (kev) params.set("kev", "true");
        if (hasBdu) params.set("has_bdu", "true");
        if (datePreset) params.set("date_preset", datePreset);
        params.set("sort", sort);
        params.set("page", String(pageNum));
        params.set("page_size", "20");
        const res = await api<SearchResponse>(`/search?${params.toString()}`);
        setData(res);
        setPage(pageNum);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Ошибка поиска");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [q, severity, kev, hasBdu, datePreset, sort],
  );

  useEffect(() => {
    runSearch(1);
  }, []); // initial load

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    runSearch(1);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="vbx-page-title">Security Vulnerability Database</h1>
        <p className="vbx-page-sub">
          Поиск CVE и записей БДУ ФСТЭК. Строки CISA KEV выделены янтарным акцентом.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            size={16}
            className="pointer-events-none absolute left-3 top-[42px] z-10 -translate-y-1/2 text-muted"
          />
          <Input
            label="Запрос"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="CVE-2024-0001, BDU:2024-00002, keyword…"
            aria-label="Поисковый запрос"
          />
        </div>
        <label className="block text-sm lg:w-44">
          <span className="mb-1.5 block text-muted">Сортировка</span>
          <select
            className="w-full rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm text-text"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="published">По дате</option>
            <option value="cvss">По CVSS</option>
            <option value="epss">По EPSS</option>
            <option value="id">По ID</option>
          </select>
        </label>
        <Button type="submit" disabled={loading}>
          {loading ? "Поиск…" : "Найти"}
        </Button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-4" aria-label="Фильтры поиска">
          <Card className="space-y-4 p-4">
            <div className="text-sm font-medium">Фильтры</div>
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">Severity</span>
              <select
                className="w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                {SEVERITIES.map((s) => (
                  <option key={s || "any"} value={s}>
                    {s || "Любая"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">Дата</span>
              <select
                className="w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm"
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value)}
              >
                {DATE_PRESETS.map((d) => (
                  <option key={d.value || "any"} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={kev}
                onChange={(e) => setKev(e.target.checked)}
                className="rounded border-border"
              />
              Только CISA KEV
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={hasBdu}
                onChange={(e) => setHasBdu(e.target.checked)}
                className="rounded border-border"
              />
              Есть БДУ
            </label>
            <Button type="button" variant="secondary" className="w-full" onClick={() => runSearch(1)}>
              Применить
            </Button>
          </Card>
        </aside>

        <div className="min-w-0 space-y-3">
          {err && (
            <Card className="border-danger/40 text-sm text-danger" role="alert">
              {err}
            </Card>
          )}
          {loading && !data && (
            <Card className="text-sm text-muted">Загрузка результатов…</Card>
          )}
          {data && (
            <div className="flex items-center justify-between text-sm text-muted">
              <span>
                Найдено: <span className="text-text">{data.total}</span>
              </span>
              <span>
                Стр. {data.page} / {totalPages}
              </span>
            </div>
          )}
          {data && data.results.length === 0 && !loading && (
            <Card className="text-sm text-muted">Ничего не найдено. Измените запрос или фильтры.</Card>
          )}
          <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-surface/90" data-testid="search-results">
            {data?.results.map((hit) => (
              <li key={`${hit.kind}-${hit.id}`}>
                <Link
                  href={hit.href}
                  className={`block px-4 py-3.5 transition hover:bg-surface2/80 ${
                    hit.is_cisa_kev ? "vbx-row-kev" : ""
                  }`}
                  data-testid={`hit-${hit.id}`}
                  data-kev={hit.is_cisa_kev ? "true" : "false"}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display font-semibold tracking-tight text-accent2">
                          {hit.id}
                        </span>
                        {hit.is_cisa_kev && (
                          <Badge tone="warn" aria-label="CISA Known Exploited Vulnerability">
                            <AlertTriangle size={10} className="mr-1" aria-hidden />
                            KEV
                          </Badge>
                        )}
                        {hit.has_bdu && (
                          <Badge tone="accent" aria-label="Есть запись БДУ">
                            BDU
                          </Badge>
                        )}
                        {hit.kind === "bdu" && (
                          <Badge tone="accent" aria-label="Запись БДУ">
                            БДУ
                          </Badge>
                        )}
                        {hit.severity && (
                          <Badge tone={severityTone(hit.severity)} aria-label={`Severity ${hit.severity}`}>
                            {hit.severity}
                            {hit.cvss_score != null ? ` ${hit.cvss_score}` : ""}
                          </Badge>
                        )}
                        {hit.epss?.score != null && (
                          <Badge tone="neutral" aria-label={`EPSS ${formatEpss(hit.epss)}`}>
                            EPSS {formatEpss(hit.epss)}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-muted">{hit.description || hit.title}</p>
                    </div>
                    <time className="shrink-0 text-xs text-muted">{formatDate(hit.published_at)}</time>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {data && totalPages > 1 && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={page <= 1 || loading}
                onClick={() => runSearch(page - 1)}
              >
                Назад
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={page >= totalPages || loading}
                onClick={() => runSearch(page + 1)}
              >
                Вперёд
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
