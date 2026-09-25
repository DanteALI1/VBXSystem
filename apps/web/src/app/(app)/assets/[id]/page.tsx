"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Fragment, FormEvent, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Download,
  GitMerge,
  RefreshCw,
  Save,
  Search,
  Ticket,
  Trash2,
} from "lucide-react";
import { api, apiDownload, hasPermission } from "@/lib/api";
import { buildQs } from "@/lib/queryString";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatDate, severityTone } from "@/lib/severity";
import {
  Finding,
  FindingDetailDrawer,
  FindingEvidencePanel,
  FindingRawEvidence,
  FindingThumb,
  findingThumbSrc,
} from "@/components/findings";

function criticalityTone(c?: string | null): "neutral" | "ok" | "warn" | "danger" | "accent" {
  const v = (c || "").toLowerCase();
  if (v === "critical") return "danger";
  if (v === "high") return "warn";
  if (v === "medium") return "accent";
  if (v === "low") return "ok";
  return "neutral";
}

type Asset = {
  id: number;
  hostname?: string | null;
  ip?: string | null;
  label?: string | null;
  kind?: string | null;
  ports?: unknown[];
  findings_count?: number;
  last_seen_at?: string | null;
  tags?: string[];
  segment?: string | null;
  criticality?: string | null;
  owner_user_id?: number | null;
  owner_username?: string | null;
};
type OwnerOpt = { id: number; username: string; full_name?: string };
type ListOut = {
  total: number;
  page: number;
  page_size: number;
  results: Finding[];
};
const PAGE_SIZE = 50;
const SEVERITIES = ["", "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const STATUSES = ["", "open", "closed", "triaged", "false_positive"];
const KINDS = ["host", "service", "network", "other"];
const SEGMENTS = ["corp-lan", "dmz", "ot", "cloud", "mgmt"];
const CRITICALITIES = ["low", "medium", "high", "critical"];
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
function portsToRaw(ports: unknown[] | undefined): string {
  if (!Array.isArray(ports) || !ports.length) return "";
  return ports
    .map((p) =>
      typeof p === "object" && p && "port" in p
        ? String((p as { port: unknown }).port)
        : String(p),
    )
    .join(", ");
}
export default function AssetDetailPage() {
  const params = useParams();
  const id = Number(params?.id);
  const { user } = useAuth();
  const router = useRouter();
  const canRead = hasPermission(user, "scan:read");
  const canWrite = hasPermission(user, "scan:run");
  const canTicket = canRead && hasPermission(user, "tickets:write");
  const [asset, setAsset] = useState<Asset | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [qDraft, setQDraft] = useState("");
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [merging, setMerging] = useState(false);
  const [editHostname, setEditHostname] = useState("");
  const [editIp, setEditIp] = useState("");
  const [editKind, setEditKind] = useState("host");
  const [editSegment, setEditSegment] = useState("");
  const [editCriticality, setEditCriticality] = useState("medium");
  const [editOwner, setEditOwner] = useState("");
  const [editPorts, setEditPorts] = useState("");
  const [editTags, setEditTags] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [owners, setOwners] = useState<OwnerOpt[]>([]);
  const [mergeTargets, setMergeTargets] = useState<Asset[]>([]);
  const [mergeIntoId, setMergeIntoId] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Finding | null>(null);
  const syncEditForm = useCallback((a: Asset) => {
    setEditHostname(a.hostname || "");
    setEditIp(a.ip || "");
    setEditKind(a.kind || "host");
    setEditSegment(a.segment || "");
    setEditCriticality(a.criticality || "medium");
    setEditOwner(a.owner_user_id != null ? String(a.owner_user_id) : "");
    setEditPorts(portsToRaw(a.ports));
    setEditTags(Array.isArray(a.tags) ? a.tags.map(String).join(", ") : "");
  }, []);
  const loadMeta = useCallback(async () => {
    try {
      const [tagsRes, ownersRes, assetsRes] = await Promise.all([
        api<{ tags: string[] }>("/assets/tags"),
        api<{ owners: OwnerOpt[] }>("/assets/owners"),
        api<{ results: Asset[] }>("/assets?page=1&page_size=200"),
      ]);
      setTagSuggestions(tagsRes.tags || []);
      setOwners(ownersRes.owners || []);
      setMergeTargets((assetsRes.results || []).filter((a) => a.id !== id));
    } catch {
      /* optional */
    }
  }, [id]);
  const loadAsset = useCallback(async () => {
    if (!id || Number.isNaN(id)) return;
    const data = await api<{ asset: Asset }>(`/assets/${id}`);
    setAsset(data.asset);
    syncEditForm(data.asset);
  }, [id, syncEditForm]);
  const loadFindings = useCallback(async () => {
    if (!id || Number.isNaN(id)) return;
    const qs = buildQs({
      asset_id: id,
      q,
      severity,
      status,
      module_id: moduleId,
      page,
      page_size: PAGE_SIZE,
    });
    const data = await api<ListOut>(`/findings?${qs}`);
    setFindings(data.results || []);
    setTotal(data.total || 0);
  }, [id, q, severity, status, moduleId, page]);
  const load = useCallback(async () => {
    if (!id || Number.isNaN(id)) return;
    setErr(null);
    setLoading(true);
    try {
      await Promise.all([loadAsset(), loadFindings(), loadMeta()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
      setAsset(null);
      setFindings([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [id, loadAsset, loadFindings, loadMeta]);
  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    load();
  }, [canRead, load]);
  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setQ(qDraft);
  }
  async function onExport() {
    if (!id || Number.isNaN(id)) return;
    setExporting(true);
    setErr(null);
    try {
      const qs = buildQs({
        asset_id: id,
        q,
        severity,
        status,
        module_id: moduleId,
        limit: 2000,
      });
      await apiDownload(`/findings/export?${qs}`, {
        filename: `findings-asset-${id}.csv`,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setExporting(false);
    }
  }
  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!canWrite || !asset) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        hostname: editHostname.trim(),
        ip: editIp.trim(),
        kind: editKind,
        segment: editSegment.trim(),
        criticality: editCriticality,
        ports: parseList(editPorts),
        tags: parseList(editTags).map(String),
      };
      if (editOwner) {
        body.owner_user_id = Number(editOwner);
      } else {
        body.owner_user_id = null;
      }
      const updated = await api<Asset>(`/assets/${asset.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setAsset(updated);
      syncEditForm(updated);
      setMsg("Узел сохранён");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }
  async function onMerge() {
    if (!canWrite || !asset || !mergeIntoId) return;
    const target = mergeTargets.find((a) => String(a.id) === mergeIntoId);
    const targetName = target
      ? target.label || target.hostname || target.ip || `#${target.id}`
      : `#${mergeIntoId}`;
    if (
      !window.confirm(
        `Слить текущий узел #${asset.id} в «${targetName}»?\n` +
          `Находки, порты и теги перейдут в целевой узел; этот узел будет удалён.`,
      )
    ) {
      return;
    }
    setMerging(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await api<{
        target: Asset;
        moved_findings: number;
        message: string;
      }>(`/assets/${asset.id}/merge`, {
        method: "POST",
        body: JSON.stringify({ into_asset_id: Number(mergeIntoId) }),
      });
      setMsg(res.message || "Слияние выполнено");
      router.push(`/assets/${res.target.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка слияния");
      setMerging(false);
    }
  }
  async function createTicket(findingId: number) {
    setBusyId(String(findingId));
    setErr(null);
    try {
      const res = await api<{ ticket: { id: number } }>(`/findings/${findingId}/ticket`, {
        method: "POST",
      });
      await loadFindings();
      router.push(`/tickets/${res.ticket.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusyId(null);
    }
  }
  async function onDelete() {
    if (!canWrite || !asset) return;
    const name = asset.label || asset.hostname || asset.ip || `Узел #${asset.id}`;
    if (
      !window.confirm(
        `Удалить узел «${name}»?\nНаходки сохранятся, связь с узлом будет снята.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setErr(null);
    try {
      await api(`/assets/${asset.id}`, { method: "DELETE" });
      router.push("/assets");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка удаления");
      setDeleting(false);
    }
  }
  function addSuggestedTag(tag: string) {
    const cur = parseList(editTags).map(String);
    if (cur.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    setEditTags([...cur, tag].join(", "));
  }
  const title = asset?.label || asset?.hostname || asset?.ip || `Узел #${id}`;
  const ports = Array.isArray(asset?.ports) ? asset!.ports! : [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (!canRead) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-semibold">Узел</h1>
        <Card>Нет права scan:read.</Card>
      </div>
    );
  }
  return (
    <div className="space-y-6" data-testid="asset-detail">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/assets" className="text-sm text-muted hover:text-text">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft size={14} /> Узлы
          </span>
        </Link>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted">Карточка узла, редактирование и находки сканеров.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite ? (
            <Button type="button" variant="secondary" onClick={onDelete} disabled={deleting || !asset}>
              <Trash2 size={14} />
              {deleting ? "…" : "Удалить"}
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
      {asset && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="space-y-2 p-4">
            <div className="text-xs uppercase tracking-wider text-muted">Hostname / FQDN</div>
            <div className="font-mono text-sm">{asset.hostname || "—"}</div>
          </Card>
          <Card className="space-y-2 p-4">
            <div className="text-xs uppercase tracking-wider text-muted">IP</div>
            <div className="font-mono text-sm">{asset.ip || "—"}</div>
          </Card>
          <Card className="space-y-2 p-4">
            <div className="text-xs uppercase tracking-wider text-muted">Сегмент / владелец</div>
            <div className="text-sm">{asset.segment || "—"}</div>
            <div className="text-xs text-muted">{asset.owner_username || "без владельца"}</div>
            {asset.criticality ? (
              <Badge tone={criticalityTone(asset.criticality)}>{asset.criticality}</Badge>
            ) : null}
          </Card>
          <Card className="space-y-2 p-4">
            <div className="text-xs uppercase tracking-wider text-muted">Находки</div>
            <div className="text-sm">{asset.findings_count ?? total}</div>
            <div className="text-xs text-muted">
              Последний скан: {formatDate(asset.last_seen_at)}
            </div>
          </Card>
        </div>
      )}
      {canWrite && asset ? (
        <Card className="space-y-3" data-testid="asset-edit-form">
          <div className="text-sm font-medium">Редактирование</div>
          <form onSubmit={onSave} className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Input
              label="Hostname / FQDN"
              value={editHostname}
              onChange={(e) => setEditHostname(e.target.value)}
            />
            <Input label="IP" value={editIp} onChange={(e) => setEditIp(e.target.value)} />
            <label className="block space-y-1.5">
              <span className="text-sm text-muted">Тип</span>
              <select
                className="vbx-field"
                value={editKind}
                onChange={(e) => setEditKind(e.target.value)}
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
                value={editCriticality}
                onChange={(e) => setEditCriticality(e.target.value)}
                data-testid="asset-edit-criticality"
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
                list="asset-edit-segment-list"
                value={editSegment}
                onChange={(e) => setEditSegment(e.target.value)}
                placeholder="corp-lan, dmz…"
                data-testid="asset-edit-segment"
              />
              <datalist id="asset-edit-segment-list">
                {SEGMENTS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-muted">Владелец</span>
              <select
                className="vbx-field"
                value={editOwner}
                onChange={(e) => setEditOwner(e.target.value)}
                data-testid="asset-edit-owner"
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
              value={editPorts}
              onChange={(e) => setEditPorts(e.target.value)}
              placeholder="80, 443"
            />
            <div className="space-y-1.5 md:col-span-2">
              <Input
                label="Теги"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="prod, dmz"
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
              <Button type="submit" disabled={saving}>
                <Save size={14} />
                {saving ? "…" : "Сохранить"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
      {canWrite && asset ? (
        <Card className="space-y-3" data-testid="asset-merge-form">
          <div className="text-sm font-medium">Слияние дубликата</div>
          <p className="text-sm text-muted">
            Перенести находки, порты и теги этого узла в другой и удалить текущий.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-[240px] flex-1 space-y-1.5">
              <span className="text-sm text-muted">Целевой узел</span>
              <select
                className="vbx-field"
                value={mergeIntoId}
                onChange={(e) => setMergeIntoId(e.target.value)}
                data-testid="asset-merge-target"
              >
                <option value="">— выберите узел —</option>
                {mergeTargets.map((a) => (
                  <option key={a.id} value={a.id}>
                    #{a.id} · {a.label || a.hostname || a.ip || "без имени"}
                    {a.segment ? ` · ${a.segment}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled={!mergeIntoId || merging}
              onClick={onMerge}
              data-testid="asset-merge-submit"
            >
              <GitMerge size={14} />
              {merging ? "…" : "Слить"}
            </Button>
          </div>
        </Card>
      ) : null}
      {ports.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-xs uppercase tracking-wider text-muted">Порты</div>
          <div className="flex flex-wrap gap-2">
            {ports.slice(0, 40).map((p, i) => {
              const label =
                typeof p === "object" && p && "port" in p
                  ? String((p as { port: unknown }).port)
                  : String(p);
              return (
                <Badge key={`${label}-${i}`} tone="neutral">
                  {label}
                </Badge>
              );
            })}
          </div>
        </Card>
      )}
      <Card className="space-y-3">
        <form onSubmit={onSearch} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Input
              label="Поиск"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder="заголовок, модуль…"
              data-testid="asset-findings-search"
            />
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm text-muted">Критичность</span>
            <select
              className="vbx-field"
              value={severity}
              onChange={(e) => {
                setPage(1);
                setSeverity(e.target.value);
              }}
              data-testid="asset-findings-severity"
            >
              {SEVERITIES.map((s) => (
                <option key={s || "all"} value={s}>
                  {s || "Все"}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-muted">Статус</span>
            <select
              className="vbx-field"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
              data-testid="asset-findings-status"
            >
              {STATUSES.map((s) => (
                <option key={s || "all"} value={s}>
                  {s || "Все"}
                </option>
              ))}
            </select>
          </label>
          <div className="w-36">
            <Input
              label="Модуль"
              value={moduleId}
              onChange={(e) => {
                setPage(1);
                setModuleId(e.target.value);
              }}
              placeholder="nmap / zap…"
              data-testid="asset-findings-module"
            />
          </div>
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
      <Card className="overflow-x-auto p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">Находки узла</div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-muted">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-2 py-3 w-14" aria-label="Превью" />
              <th className="px-4 py-3">Заголовок</th>
              <th className="px-4 py-3">Критичность</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Модуль</th>
              <th className="px-4 py-3">CVE</th>
              <th className="px-4 py-3">Создано</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {findings.map((f) => {
              const expanded = expandedId === f.id;
              const hasThumb = !!findingThumbSrc(f);
              return (
                <Fragment key={f.id}>
                  <tr
                    className={`border-b border-border/70 cursor-pointer hover:bg-surface2/40 ${
                      expanded ? "bg-surface2/50" : ""
                    }`}
                    onClick={() => setExpandedId(expanded ? null : f.id)}
                    data-testid={`asset-finding-row-${f.id}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs">{f.id}</td>
                    <td className="px-2 py-2">{hasThumb ? <FindingThumb finding={f} /> : null}</td>
                    <td className="px-4 py-3 font-medium">{f.title}</td>
                    <td className="px-4 py-3">
                      {f.severity ? (
                        <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {f.status ? <Badge>{f.status}</Badge> : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted">{f.module_id || "—"}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {(f.linked_cve_ids || []).map((cve) => (
                        <Link
                          key={cve}
                          href={`/vuln/${encodeURIComponent(cve)}`}
                          className="mr-1 text-accent2 hover:underline"
                        >
                          {cve}
                        </Link>
                      ))}
                      {!(f.linked_cve_ids || []).length ? (
                        <span className="text-muted">—</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{formatDate(f.created_at)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setSelected(f)}
                          title="Подробнее"
                        >
                          Детали
                        </Button>
                        {f.ticket_id ? (
                          <Link href={`/tickets/${f.ticket_id}`} className="text-accent2 hover:underline">
                            Заявка #{f.ticket_id}
                          </Link>
                        ) : canTicket ? (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busyId === String(f.id)}
                            onClick={() => createTicket(f.id)}
                          >
                            <Ticket size={14} />В заявку
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="border-b border-border/70 bg-surface2/30">
                      <td colSpan={9} className="px-4 py-4">
                        <div className="max-w-3xl space-y-4">
                          <FindingEvidencePanel finding={f} />
                          <FindingRawEvidence finding={f} />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {loading && <p className="p-4 text-sm text-muted">Загрузка…</p>}
        {!loading && !findings.length && (
          <p className="p-4 text-sm text-muted">По этому узлу находок нет (или фильтры слишком строгие).</p>
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
      <FindingDetailDrawer
        finding={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        canTicket={canTicket}
        busyId={busyId != null ? `ticket-${busyId}` : null}
        onCreateTicket={(fid) => createTicket(fid)}
      />
    </div>
  );
}
