"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Download, Plus, RefreshCw, Search, Server, Trash2 } from "lucide-react";
import { api, apiDownload, hasPermission } from "@/lib/api";
import { buildQs } from "@/lib/queryString";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatDate } from "@/lib/severity";
type Asset = {
  id: number;
  hostname?: string | null;
  ip?: string | null;
  label?: string | null;
  kind?: string | null;
  ports?: unknown[];
  tags?: unknown[];
  segment?: string | null;
  owner_user_id?: number | null;
  owner_username?: string | null;
  criticality?: string | null;
  findings_count?: number;
  last_seen_at?: string | null;
};
type OwnerOpt = { id: number; username: string; full_name?: string };
type ListOut = {
  total: number;
  page: number;
  page_size: number;
  results: Asset[];
};
const PAGE_SIZE = 50;
const KINDS = ["host", "service", "network", "other"];
const SEGMENTS = ["", "corp-lan", "dmz", "ot", "cloud", "mgmt"];
const CRITICALITIES = ["low", "medium", "high", "critical"];
function criticalityTone(c?: string | null): "neutral" | "ok" | "warn" | "danger" | "accent" {
  const v = (c || "").toLowerCase();
  if (v === "critical") return "danger";
  if (v === "high") return "warn";
  if (v === "medium") return "accent";
  if (v === "low") return "ok";
  return "neutral";
}
function displayName(a: Asset): string {
  return a.label || a.hostname || a.ip || `Узел #${a.id}`;
}
function parseList(raw: string): (string | number)[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const n = Number(s);
      return Number.isFinite(n) && /^\d+$/.test(s) ? n : s;
    });
}
export default function AssetsPage() {
  const { user } = useAuth();
  const canRead = hasPermission(user, "scan:read");
  const canWrite = hasPermission(user, "scan:run");
  const [qDraft, setQDraft] = useState("");
  const [q, setQ] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Asset[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hostname, setHostname] = useState("");
  const [ip, setIp] = useState("");
  const [kind, setKind] = useState("host");
  const [segment, setSegment] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [portsRaw, setPortsRaw] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [criticality, setCriticality] = useState("medium");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [owners, setOwners] = useState<OwnerOpt[]>([]);
  const loadMeta = useCallback(async () => {
    try {
      const [tagsRes, ownersRes] = await Promise.all([
        api<{ tags: string[] }>("/assets/tags"),
        api<{ owners: OwnerOpt[] }>("/assets/owners"),
      ]);
      setTagSuggestions(tagsRes.tags || []);
      setOwners(ownersRes.owners || []);
    } catch {
      /* optional meta */
    }
  }, []);
  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const qs = buildQs({
        q,
        segment: segmentFilter || undefined,
        owner_user_id: ownerFilter || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      const data = await api<ListOut>(`/assets?${qs}`);
      setRows(data.results || []);
      setTotal(data.total || 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, segmentFilter, ownerFilter, page]);
  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    loadMeta();
    load();
  }, [canRead, load, loadMeta]);
  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setQ(qDraft);
  }
  async function onExport() {
    setExporting(true);
    setErr(null);
    try {
      const qs = buildQs({
        q,
        segment: segmentFilter || undefined,
        owner_user_id: ownerFilter || undefined,
        limit: 2000,
      });
      await apiDownload(`/assets/export?${qs}`, { filename: "assets-export.csv" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setExporting(false);
    }
  }
  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const created = await api<Asset>("/assets", {
        method: "POST",
        body: JSON.stringify({
          hostname: hostname.trim(),
          ip: ip.trim(),
          kind,
          segment: segment.trim(),
          owner_user_id: ownerUserId ? Number(ownerUserId) : null,
          ports: parseList(portsRaw),
          tags: parseList(tagsRaw).map(String),
          criticality,
        }),
      });
      setMsg(`Узел #${created.id} добавлен`);
      setHostname("");
      setIp("");
      setKind("host");
      setSegment("");
      setOwnerUserId("");
      setPortsRaw("");
      setTagsRaw("");
      setCriticality("medium");
      setShowForm(false);
      setPage(1);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка создания");
    } finally {
      setSaving(false);
    }
  }
  async function onDelete(a: Asset) {
    if (!canWrite) return;
    const name = displayName(a);
    if (
      !window.confirm(
        `Удалить узел «${name}»?\nНаходки сохранятся, связь с узлом будет снята.`,
      )
    ) {
      return;
    }
    setBusyId(String(a.id));
    setErr(null);
    setMsg(null);
    try {
      const res = await api<{ unlinked_findings?: number }>(`/assets/${a.id}`, {
        method: "DELETE",
      });
      const n = res.unlinked_findings ?? 0;
      setMsg(
        n > 0
          ? `Узел удалён; отвязано находок: ${n}`
          : "Узел удалён",
      );
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка удаления");
    } finally {
      setBusyId(null);
    }
  }
  function addSuggestedTag(tag: string) {
    const cur = parseList(tagsRaw).map(String);
    if (cur.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    setTagsRaw([...cur, tag].join(", "));
  }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (!canRead) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-semibold">Узлы</h1>
        <Card>Нет права scan:read.</Card>
      </div>
    );
  }
  return (
    <div className="space-y-6" data-testid="assets-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Узлы</h1>
          <p className="mt-1 text-sm text-muted">
            Инвентарь хостов: сегменты, владельцы, слияние дубликатов и карточка с findings.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite ? (
            <Button
              type="button"
              variant={showForm ? "secondary" : "primary"}
              onClick={() => setShowForm((v) => !v)}
            >
              <Plus size={14} />
              {showForm ? "Скрыть форму" : "Добавить узел"}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={onExport} disabled={exporting || loading}>
            <Download size={14} />
            {exporting ? "…" : "CSV"}
          </Button>
          <Button type="button" variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} />
            Обновить
          </Button>
        </div>
      </div>
      {showForm && canWrite ? (
        <Card className="space-y-3" data-testid="assets-create-form">
          <div className="text-sm font-medium">Новый узел</div>
          <form onSubmit={onCreate} className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Input
              label="Hostname / FQDN"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="web.example.local"
              data-testid="assets-hostname"
            />
            <Input
              label="IP"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="10.0.0.1"
              data-testid="assets-ip"
            />
            <label className="block space-y-1.5">
              <span className="text-sm text-muted">Тип</span>
              <select
                className="vbx-field"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                data-testid="assets-kind"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-muted">Критичность</span>
              <select
                className="vbx-field"
                value={criticality}
                onChange={(e) => setCriticality(e.target.value)}
                data-testid="assets-criticality"
              >
                {CRITICALITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-muted">Сегмент сети</span>
              <input
                className="vbx-field"
                list="assets-segment-list"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                placeholder="corp-lan, dmz…"
                data-testid="assets-segment"
              />
              <datalist id="assets-segment-list">
                {SEGMENTS.filter(Boolean).map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-muted">Владелец</span>
              <select
                className="vbx-field"
                value={ownerUserId}
                onChange={(e) => setOwnerUserId(e.target.value)}
                data-testid="assets-owner"
              >
                <option value="">— не назначен —</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.full_name ? `${o.username} (${o.full_name})` : o.username}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Порты"
              value={portsRaw}
              onChange={(e) => setPortsRaw(e.target.value)}
              placeholder="80, 443, 8080"
              data-testid="assets-ports"
            />
            <div className="space-y-1.5 md:col-span-2">
              <Input
                label="Теги"
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                placeholder="prod, dmz"
                data-testid="assets-tags"
              />
              {tagSuggestions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {tagSuggestions.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:border-accent2 hover:text-text"
                      onClick={() => addSuggestedTag(t)}
                    >
                      + {t}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={saving || (!hostname.trim() && !ip.trim())}>
                {saving ? "…" : "Создать"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
      <Card className="space-y-3">
        <form onSubmit={onSearch} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px] flex-1">
            <Input
              label="Поиск"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder="hostname, IP, сегмент…"
              data-testid="assets-search"
            />
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm text-muted">Сегмент</span>
            <input
              className="vbx-field w-36"
              list="assets-filter-segment-list"
              value={segmentFilter}
              onChange={(e) => {
                setPage(1);
                setSegmentFilter(e.target.value);
              }}
              placeholder="все"
              data-testid="assets-filter-segment"
            />
            <datalist id="assets-filter-segment-list">
              {SEGMENTS.filter(Boolean).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-muted">Владелец</span>
            <select
              className="vbx-field"
              value={ownerFilter}
              onChange={(e) => {
                setPage(1);
                setOwnerFilter(e.target.value);
              }}
              data-testid="assets-filter-owner"
            >
              <option value="">Все</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.username}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={loading}>
            <Search size={14} />
            Найти
          </Button>
        </form>
        <div className="text-sm text-muted">
          Найдено: <span className="text-text">{total}</span>
          {totalPages > 1 ? (
            <span>
              {" "}
              · стр. {page}/{totalPages}
            </span>
          ) : null}
        </div>
      </Card>
      {err && (
        <Card className="border-danger/40 text-sm text-danger" role="alert">
          {err}
        </Card>
      )}
      {msg && (
        <Card className="text-sm text-ok" role="status">
          {msg}
        </Card>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-muted">
            <tr>
              <th className="px-4 py-3">Узел</th>
              <th className="px-4 py-3">Hostname / FQDN</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Сегмент</th>
              <th className="px-4 py-3">Критичность</th>
              <th className="px-4 py-3">Владелец</th>
              <th className="px-4 py-3">Порты</th>
              <th className="px-4 py-3">Находки</th>
              <th className="px-4 py-3">Последний скан</th>
              {canWrite ? <th className="px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const ports = Array.isArray(a.ports) ? a.ports.length : 0;
              return (
                <tr key={a.id} className="border-b border-border/70">
                  <td className="px-4 py-3">
                    <Link
                      href={`/assets/${a.id}`}
                      className="inline-flex items-center gap-2 font-medium text-accent2 hover:underline"
                    >
                      <Server size={14} className="text-muted" />
                      {displayName(a)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {a.hostname || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{a.ip || "—"}</td>
                  <td className="px-4 py-3 text-muted">{a.segment || "—"}</td>
                  <td className="px-4 py-3">
                    {a.criticality ? (
                      <Badge tone={criticalityTone(a.criticality)}>{a.criticality}</Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{a.owner_username || "—"}</td>
                  <td className="px-4 py-3 text-muted">{ports || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge>{a.findings_count ?? 0}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{formatDate(a.last_seen_at)}</td>
                  {canWrite ? (
                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busyId === String(a.id)}
                        onClick={() => onDelete(a)}
                        aria-label={`Удалить узел ${displayName(a)}`}
                        title="Удалить"
                      >
                        <Trash2 size={14} />
                        {busyId === String(a.id) ? "…" : "Удалить"}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && <p className="p-4 text-sm text-muted">Загрузка…</p>}
        {!loading && !rows.length && (
          <p className="p-4 text-sm text-muted">
            {q || segmentFilter || ownerFilter
              ? "По текущему фильтру узлов нет. Сбросьте фильтры или добавьте узел вручную."
              : "Узлов пока нет — добавьте вручную или запустите скан / промоут из находок."}
          </p>
        )}
      </Card>
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Назад
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Вперёд
          </Button>
        </div>
      )}
    </div>
  );
}
