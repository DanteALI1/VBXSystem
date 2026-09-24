"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatDate } from "@/lib/severity";

type Exploit = {
  xdb_id: string;
  cve_id?: string | null;
  published_at?: string | null;
  repo_url: string;
  repo_name: string;
  author: string;
  source: string;
};

type ListOut = {
  total: number;
  page: number;
  page_size: number;
  results: Exploit[];
};

type SortKey = "published" | "xdb_id" | "cve_id" | "repo" | "author";

export default function XdbPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [cveId, setCveId] = useState("");
  const [author, setAuthor] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<SortKey>("published");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canImport = !!user && (user.is_super_admin || user.roles.includes("admin"));

  const load = useCallback(
    async (pageNum = 1) => {
      setBusy(true);
      setErr(null);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (cveId.trim()) params.set("cve_id", cveId.trim());
        if (author.trim()) params.set("author", author.trim());
        if (dateFrom) params.set("date_from", dateFrom);
        if (dateTo) params.set("date_to", dateTo);
        params.set("sort", sort);
        params.set("order", order);
        params.set("page", String(pageNum));
        params.set("page_size", "25");
        const res = await api<ListOut>(`/xdb?${params.toString()}`);
        setData(res);
        setPage(pageNum);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Ошибка");
        setData(null);
      } finally {
        setBusy(false);
      }
    },
    [q, cveId, author, dateFrom, dateTo, sort, order],
  );

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, order]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    load(1);
  }

  function toggleSort(key: SortKey) {
    if (sort === key) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setOrder(key === "published" ? "desc" : "asc");
    }
  }

  async function importSample() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await api<{ message: string }>("/xdb/import/sample", { method: "POST" });
      setMsg(res.message);
      await load(1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка импорта");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = localStorage.getItem("vbx_access_token");
      const res = await fetch("/api/xdb/import/file", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Ошибка загрузки");
      setMsg(body.message || "Импорт выполнен");
      await load(1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-6" data-testid="xdb-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Exploits (XDB)</h1>
          <p className="mt-1 text-sm text-muted">
            Каталог ссылок на PoC/repos (метаданные). Исполняемые эксплойты не хранятся.
            Live-коннектор внешней ленты — пока недоступен (501); используйте CSV/JSON import.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => load(page)} disabled={busy}>
            <RefreshCw size={14} />
            Обновить
          </Button>
          {canImport && (
            <>
              <Button type="button" variant="secondary" onClick={importSample} disabled={busy}>
                Sample dataset
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface2 px-4 py-2.5 text-sm hover:border-accent/40">
                <Upload size={14} />
                CSV / JSON
                <input
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0] || null)}
                />
              </label>
            </>
          )}
        </div>
      </div>

      {err && (
        <Card className="border-danger/40 text-sm text-danger" role="alert">
          {err}
        </Card>
      )}
      {msg && <Card className="text-sm text-ok">{msg}</Card>}

      <Card>
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <Input label="Поиск" value={q} onChange={(e) => setQ(e.target.value)} placeholder="XDB / CVE / repo / author" />
          <Input label="CVE" value={cveId} onChange={(e) => setCveId(e.target.value)} placeholder="CVE-2024-0001" />
          <Input label="Author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="researcher" />
          <Input label="Date from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input label="Date to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <div className="md:col-span-2 lg:col-span-5">
            <Button type="submit" disabled={busy}>
              {busy ? "Поиск…" : "Найти"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0" data-testid="xdb-table">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-surface2/60 text-muted">
            <tr>
              {(
                [
                  ["published", "Date"],
                  ["xdb_id", "XDB ID"],
                  ["cve_id", "CVE ID"],
                  ["repo", "Repository"],
                  ["author", "Author"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th key={key} className="px-4 py-3 font-medium">
                  <button type="button" className="hover:text-text" onClick={() => toggleSort(key)}>
                    {label}
                    {sort === key ? (order === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.results || []).map((row) => (
              <tr key={row.xdb_id} className="border-b border-border/70 hover:bg-surface2/40" data-testid={`xdb-${row.xdb_id}`}>
                <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(row.published_at)}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.xdb_id}</td>
                <td className="px-4 py-3">
                  {row.cve_id ? (
                    <Link href={`/vuln/${encodeURIComponent(row.cve_id)}`} className="text-accent2 hover:underline">
                      {row.cve_id}
                    </Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.repo_url ? (
                    <a
                      href={row.repo_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-accent2 hover:underline"
                    >
                      {row.repo_name || row.repo_url}
                      <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span className="text-muted">{row.repo_name || "—"}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.author || "—"}
                  {row.source && (
                    <Badge tone="neutral" className="ml-2">
                      {row.source}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.results.length === 0 && (
          <div className="p-8 text-center text-sm text-muted">
            Нет записей.
            {canImport && (
              <div className="mt-3">
                <Button type="button" onClick={importSample}>
                  Загрузить sample dataset
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {data && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Найдено: <span className="text-text">{data.total}</span>
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={page <= 1 || busy} onClick={() => load(page - 1)}>
              Назад
            </Button>
            <span className="self-center">
              {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= totalPages || busy}
              onClick={() => load(page + 1)}
            >
              Вперёд
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
