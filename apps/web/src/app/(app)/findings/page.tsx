"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  GitCompare,
  MoreHorizontal,
  RefreshCw,
  RotateCw,
  Server,
  Ticket,
  X,
} from "lucide-react";
import { SavedFiltersMenu, type FindingsFilterQuery } from "@/components/findings/SavedFiltersMenu";
import { api, apiDownload, getToken, hasPermission } from "@/lib/api";
import { buildQs } from "@/lib/queryString";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  ChipFilter,
  ChipFilterBar,
  ChipFilterDef,
  chipsToParams,
} from "@/components/filters/ChipFilterBar";
import { formatDate, severityTone } from "@/lib/severity";

type FindingEvidence = {
  module?: string | null;
  url?: string | null;
  artifact_key?: string | null;
  thumbnail_artifact_key?: string | null;
  thumbnail_b64?: string | null;
  thumbnail_format?: string | null;
  screenshot_path?: string | null;
  [key: string]: unknown;
};

type Finding = {
  id: number;
  title: string;
  severity?: string | null;
  status?: string | null;
  module_id?: string | null;
  scan_job_id?: number | null;
  ticket_id?: number | null;
  asset_id?: number | null;
  asset_hostname?: string | null;
  asset_ip?: string | null;
  asset_label?: string | null;
  linked_cve_ids?: string[] | null;
  linked_bdu_ids?: string[] | null;
  fingerprint?: string | null;
  occurrence_count?: number | null;
  created_at?: string | null;
  evidence?: FindingEvidence | null;
  risk_score?: number | null;
  priority?: string | null;
  due_at?: string | null;
  sla_hours?: number | null;
  acceptance_reason?: string | null;
  accepted_until?: string | null;
  tags?: string[] | null;
  assignee_user_id?: number | null;
  project_id?: number | null;
  external_ref?: string | null;
};

type FindingEvent = {
  id: number;
  finding_id: number;
  actor_user_id?: number | null;
  event_type?: string;
  message?: string;
  meta?: Record<string, unknown>;
  created_at?: string | null;
};

type TicketOut = { id: number };

type ListOut = {
  total: number;
  page: number;
  page_size: number;
  results: Finding[];
};

const PAGE_SIZE = 50;

const BULK_STATUSES = [
  { value: "triaged", label: "triaged" },
  { value: "false_positive", label: "false_positive" },
  { value: "accepted", label: "accepted" },
  { value: "closed", label: "closed" },
] as const;

const FINDING_STATUSES = [
  { value: "open", label: "open" },
  ...BULK_STATUSES,
  { value: "fixed", label: "fixed" },
] as const;

function priorityTone(p?: string | null): "neutral" | "ok" | "warn" | "danger" | "accent" {
  const v = (p || "").toLowerCase();
  if (v === "urgent") return "danger";
  if (v === "high") return "warn";
  if (v === "medium") return "accent";
  if (v === "low") return "ok";
  return "neutral";
}

function isOverdue(f: Finding): boolean {
  if (!f.due_at) return false;
  const st = (f.status || "").toLowerCase();
  if (["closed", "fixed", "false_positive", "accepted"].includes(st)) return false;
  return new Date(f.due_at).getTime() < Date.now();
}

type JobSummary = {
  job: { id: number; module_id: string; status: string; params?: Record<string, unknown> | null };
  findings_total: number;
  by_severity: Record<string, number>;
  hosts_count: number;
  duration_sec: number | null;
};

type JobDiff = {
  job_id: number;
  previous_job_id: number | null;
  new: Finding[];
  fixed: Finding[];
  persistent: Finding[];
  summary: Record<string, number>;
};

function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || sec < 0) return "—";
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} мин ${s} с` : `${m} мин`;
}

function ScanJobSummaryStrip({
  scanJobId,
  canRun,
  onRetestDone,
}: {
  scanJobId: number;
  canRun: boolean;
  onRetestDone: (newJobId?: number) => void;
}) {
  const [summary, setSummary] = useState<JobSummary | null>(null);
  const [diff, setDiff] = useState<JobDiff | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [loading, setLoading] = useState(true);
  const [diffLoading, setDiffLoading] = useState(false);
  const [retestBusy, setRetestBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await api<JobSummary>(`/modules/jobs/${scanJobId}/summary`);
        if (!cancelled) setSummary(data);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Ошибка");
          setSummary(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scanJobId]);

  useEffect(() => {
    if (!showDiff) return;
    let cancelled = false;
    (async () => {
      setDiffLoading(true);
      try {
        const data = await api<JobDiff>(`/modules/jobs/${scanJobId}/diff`);
        if (!cancelled) setDiff(data);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Ошибка diff");
      } finally {
        if (!cancelled) setDiffLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showDiff, scanJobId]);

  async function retest() {
    setRetestBusy(true);
    setErr(null);
    try {
      const job = await api<{ id: number }>(`/modules/jobs/${scanJobId}/retest`, { method: "POST" });
      onRetestDone(job?.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка retest");
    } finally {
      setRetestBusy(false);
    }
  }

  const sev = summary?.by_severity || {};

  return (
    <Card className="space-y-3 text-sm" data-testid="scan-job-summary">
      {loading && <p className="text-muted">Загрузка сводки скана…</p>}
      {err && (
        <p className="text-danger" role="alert">
          {err}
        </p>
      )}
      {summary && !loading && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span>
                Находок: <strong className="text-text">{summary.findings_total}</strong>
              </span>
              <span>
                Хостов: <strong className="text-text">{summary.hosts_count}</strong>
              </span>
              <span>
                Длительность: <strong className="text-text">{fmtDuration(summary.duration_sec)}</strong>
              </span>
              <span className="text-muted">· {summary.job.module_id}</span>
              <Badge>{summary.job.status}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {canRun ? (
                <Button type="button" variant="secondary" disabled={retestBusy} onClick={retest}>
                  <RotateCw size={14} />
                  {retestBusy ? "…" : "Retest"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant={showDiff ? "primary" : "ghost"}
                onClick={() => setShowDiff((v) => !v)}
              >
                <GitCompare size={14} />
                Diff
                <ChevronDown size={12} className={showDiff ? "rotate-180" : ""} />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(sev).map(([k, v]) => (
              <Badge key={k} tone={severityTone(k)}>
                {k}: {v}
              </Badge>
            ))}
            {!Object.keys(sev).length ? <span className="text-xs text-muted">Нет разбивки по severity</span> : null}
          </div>
          {showDiff && (
            <div className="space-y-2 border-t border-border pt-3">
              {diffLoading && <p className="text-xs text-muted">Загрузка diff…</p>}
              {diff && !diffLoading && (
                <>
                  {diff.previous_job_id != null ? (
                    <p className="text-xs text-muted">
                      Сравнение с заданием #{diff.previous_job_id}
                    </p>
                  ) : (
                    <p className="text-xs text-muted">Предыдущее задание не найдено</p>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge tone="ok">new: {diff.summary?.new ?? diff.new.length}</Badge>
                    <Badge tone="neutral">persistent: {diff.summary?.persistent ?? diff.persistent.length}</Badge>
                    <Badge tone="warn">fixed: {diff.summary?.fixed ?? diff.fixed.length}</Badge>
                  </div>
                  <DiffFindingLists diff={diff} />
                </>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function CveIntelStrip({ cveIds }: { cveIds: string[] }) {
  const [rows, setRows] = useState<
    { id: string; is_cisa_kev?: boolean; epss_score?: number | null }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: { id: string; is_cisa_kev?: boolean; epss_score?: number | null }[] = [];
      for (const id of cveIds.slice(0, 5)) {
        try {
          const cve = await api<{
            id: string;
            is_cisa_kev?: boolean;
            epss?: { score?: number } | null;
            epss_score?: number | null;
          }>(`/vuln/${encodeURIComponent(id)}`);
          out.push({
            id,
            is_cisa_kev: !!cve.is_cisa_kev,
            epss_score: cve.epss?.score ?? cve.epss_score ?? null,
          });
        } catch {
          out.push({ id });
        }
      }
      if (!cancelled) setRows(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [cveIds.join(",")]);
  if (!cveIds.length) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">Intel (CVE)</div>
      <div className="flex flex-wrap gap-2">
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/vuln/${encodeURIComponent(r.id)}`}
            className="inline-flex flex-wrap items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:border-accent/40"
          >
            <span className="font-mono text-accent2">{r.id}</span>
            {r.is_cisa_kev ? <Badge tone="warn">KEV</Badge> : null}
            {r.epss_score != null ? (
              <Badge tone="neutral">EPSS {(r.epss_score * 100).toFixed(1)}%</Badge>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

function DiffFindingLists({ diff }: { diff: JobDiff }) {
  const sections = [
    { key: "new", label: "Новые", items: diff.new },
    { key: "persistent", label: "Без изменений", items: diff.persistent },
    { key: "fixed", label: "Исправлено", items: diff.fixed },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {sections.map((s) => (
        <details key={s.key} className="rounded-lg border border-border bg-surface2/30">
          <summary className="cursor-pointer px-2 py-1.5 text-xs font-medium">
            {s.label} ({s.items.length})
          </summary>
          <ul className="max-h-40 space-y-1 overflow-y-auto px-2 pb-2 text-xs">
            {s.items.slice(0, 50).map((f) => (
              <li key={f.id} className="truncate text-muted">
                #{f.id} {f.title}
              </li>
            ))}
            {s.items.length > 50 ? (
              <li className="text-muted">… ещё {s.items.length - 50}</li>
            ) : !s.items.length ? (
              <li className="text-muted">—</li>
            ) : null}
          </ul>
        </details>
      ))}
    </div>
  );
}

const FINDINGS_DEFS: ChipFilterDef[] = [
  {
    field: "severity",
    label: "Критичность",
    type: "enum",
    ops: ["="],
    options: [
      { value: "CRITICAL", label: "CRITICAL" },
      { value: "HIGH", label: "HIGH" },
      { value: "MEDIUM", label: "MEDIUM" },
      { value: "LOW", label: "LOW" },
      { value: "INFO", label: "INFO" },
    ],
    hint: "CRITICAL / HIGH / …",
  },
  {
    field: "status",
    label: "Статус",
    type: "enum",
    ops: ["="],
    options: [
      { value: "open", label: "open" },
      { value: "triaged", label: "triaged" },
      { value: "false_positive", label: "false_positive" },
      { value: "accepted", label: "accepted" },
      { value: "fixed", label: "fixed" },
      { value: "closed", label: "closed" },
    ],
  },
  {
    field: "module_id",
    label: "Модуль",
    type: "enum",
    ops: ["="],
    options: [
      { value: "nmap", label: "nmap" },
      { value: "shodan", label: "shodan" },
      { value: "zap", label: "zap" },
      { value: "nuclei", label: "nuclei" },
      { value: "gowitness", label: "gowitness" },
      { value: "discovery", label: "discovery" },
    ],
    hint: "nmap / shodan / zap / nuclei / gowitness / discovery",
  },
  {
    field: "priority",
    label: "Приоритет",
    type: "enum",
    ops: ["="],
    options: [
      { value: "low", label: "low" },
      { value: "medium", label: "medium" },
      { value: "high", label: "high" },
      { value: "urgent", label: "urgent" },
    ],
  },
  {
    field: "overdue",
    label: "Просрочено",
    type: "enum",
    ops: ["="],
    options: [
      { value: "true", label: "да" },
      { value: "false", label: "нет" },
    ],
    hint: "SLA / due_at",
  },
  {
    field: "risk_min",
    label: "Risk ≥",
    type: "string",
    ops: [">="],
    hint: "мин. risk_score",
  },
  {
    field: "tag",
    label: "Тег",
    type: "string",
    ops: ["="],
    hint: "фильтр по тегу",
  },
];

function resourceLabel(f: Finding): string {
  return f.asset_label || f.asset_hostname || f.asset_ip || "";
}

function thumbDataUrl(ev?: FindingEvidence | null): string | null {
  const b64 = ev?.thumbnail_b64;
  if (!b64 || typeof b64 !== "string") return null;
  if (b64.startsWith("data:")) return b64;
  const fmt = (ev?.thumbnail_format || "png").replace(/[^a-z0-9]/gi, "") || "png";
  return `data:image/${fmt};base64,${b64}`;
}

function hasVisualEvidence(ev?: FindingEvidence | null): boolean {
  if (!ev) return false;
  return Boolean(ev.thumbnail_b64 || ev.artifact_key || ev.thumbnail_artifact_key);
}

async function fetchArtifactObjectUrl(path: string): Promise<string> {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`/api${path}`, { headers, credentials: "include" });
  if (!res.ok) throw new Error("Не удалось загрузить артефакт");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

function EvidenceThumb({ finding }: { finding: Finding }) {
  const ev = finding.evidence;
  const dataUrl = thumbDataUrl(ev);
  if (dataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={dataUrl}
        alt=""
        className="h-10 w-16 rounded border border-border object-cover object-top bg-surface2"
      />
    );
  }
  if (ev?.artifact_key || ev?.thumbnail_artifact_key) {
    return (
      <span className="inline-flex h-10 w-16 items-center justify-center rounded border border-border bg-surface2 text-[10px] text-muted">
        PNG
      </span>
    );
  }
  return <span className="text-muted">—</span>;
}

function AcceptanceModal({
  open,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string, acceptedUntil: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("");
    const d = new Date();
    d.setDate(d.getDate() + 90);
    setUntil(d.toISOString().slice(0, 10));
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Принятие риска"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="acceptance-modal"
      >
        <div>
          <h3 className="font-display text-base font-semibold">Принятие риска (accepted)</h3>
          <p className="mt-1 text-xs text-muted">Укажите причину и срок действия принятия.</p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">Причина</span>
          <textarea
            className="vbx-field min-h-[80px]"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Обоснование принятия риска…"
            data-testid="acceptance-reason"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">Действует до</span>
          <input
            type="date"
            className="vbx-field"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            data-testid="acceptance-until"
          />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={busy || !reason.trim() || !until}
            onClick={() => onConfirm(reason.trim(), until)}
          >
            {busy ? "…" : "Принять"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FindingDetailPanel({
  findingId,
  onClose,
  canRun,
  onUpdated,
}: {
  findingId: number;
  onClose: () => void;
  canRun?: boolean;
  onUpdated?: () => void;
}) {
  const [detail, setDetail] = useState<Finding | null>(null);
  const [events, setEvents] = useState<FindingEvent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusBusy, setStatusBusy] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      setLoading(true);
      setErr(null);
      setImgUrl(null);
      setEvents([]);
      try {
        const [data, evs] = await Promise.all([
          api<Finding>(`/findings/${findingId}`),
          api<FindingEvent[]>(`/findings/${findingId}/events`).catch(() => [] as FindingEvent[]),
        ]);
        if (cancelled) return;
        setDetail(data);
        setEvents(Array.isArray(evs) ? evs : []);
        const ev = data.evidence;
        const inline = thumbDataUrl(ev);
        const key = ev?.artifact_key || ev?.thumbnail_artifact_key;
        if (key) {
          try {
            objectUrl = await fetchArtifactObjectUrl(
              `/findings/${findingId}/artifacts/${encodeURI(key)}`,
            );
            if (!cancelled) setImgUrl(objectUrl);
          } catch {
            if (inline && !cancelled) setImgUrl(inline);
          }
        } else if (inline && !cancelled) {
          setImgUrl(inline);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Ошибка");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [findingId]);

  async function applyStatus(
    next: string,
    extra?: { acceptance_reason?: string; accepted_until?: string; reason?: string },
  ) {
    if (!detail || next === detail.status) return;
    setStatusBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { status: next };
      if (extra?.acceptance_reason) {
        body.acceptance_reason = extra.acceptance_reason;
        body.reason = extra.acceptance_reason;
      } else if (extra?.reason) {
        body.reason = extra.reason;
      }
      if (extra?.accepted_until) {
        body.accepted_until = extra.accepted_until.includes("T")
          ? extra.accepted_until
          : `${extra.accepted_until}T23:59:59Z`;
      }
      const updated = await api<Finding>(`/findings/${findingId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setDetail(updated);
      try {
        const evs = await api<FindingEvent[]>(`/findings/${findingId}/events`);
        setEvents(Array.isArray(evs) ? evs : []);
      } catch {
        /* ignore */
      }
      onUpdated?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка статуса");
    } finally {
      setStatusBusy(false);
      setAcceptOpen(false);
      setPendingStatus(null);
    }
  }

  function changeStatus(next: string) {
    if (!detail || next === detail.status) return;
    if (next === "accepted") {
      setPendingStatus(next);
      setAcceptOpen(true);
      return;
    }
    void applyStatus(next);
  }

  const ev = detail?.evidence;
  const metaEntries = ev
    ? Object.entries(ev).filter(
        ([k]) =>
          ![
            "thumbnail_b64",
            "thumbnail_format",
            "screenshot_path_orig",
            "artifact_path_orig",
          ].includes(k),
      )
    : [];
  const tags = Array.isArray(detail?.tags) ? detail!.tags! : [];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Детали находки"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-lg flex-col border-l border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="finding-detail"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-xs text-muted">Находка #{findingId}</div>
            <h2 className="text-sm font-semibold text-text">{detail?.title || "…"}</h2>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-muted hover:bg-surface2 hover:text-text"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
          {loading && <p className="text-muted">Загрузка…</p>}
          {err && (
            <p className="text-danger" role="alert">
              {err}
            </p>
          )}
          {detail && !loading && (
            <>
              <div className="flex flex-wrap gap-2">
                {detail.severity ? (
                  <Badge tone={severityTone(detail.severity)}>{detail.severity}</Badge>
                ) : null}
                {detail.priority ? (
                  <Badge tone={priorityTone(detail.priority)}>{detail.priority}</Badge>
                ) : null}
                {detail.risk_score != null ? (
                  <Badge tone="neutral">risk {detail.risk_score}</Badge>
                ) : null}
                {detail.status ? <Badge>{detail.status}</Badge> : null}
                {isOverdue(detail) ? <Badge tone="danger">overdue</Badge> : null}
                {canRun ? (
                  <label className="inline-flex items-center gap-1 text-xs">
                    <span className="text-muted">Статус</span>
                    <select
                      className="vbx-field py-0.5 text-xs"
                      value={detail.status || "open"}
                      disabled={statusBusy}
                      onChange={(e) => changeStatus(e.target.value)}
                    >
                      {FINDING_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {detail.module_id ? <Badge tone="neutral">{detail.module_id}</Badge> : null}
                {detail.scan_job_id != null ? (
                  <Link
                    href={`/findings?scan_job_id=${detail.scan_job_id}`}
                    className="inline-flex"
                  >
                    <Badge tone="neutral">скан #{detail.scan_job_id}</Badge>
                  </Link>
                ) : null}
                {detail.project_id != null ? (
                  <Link href={`/findings?project_id=${detail.project_id}`} className="inline-flex">
                    <Badge tone="neutral">проект #{detail.project_id}</Badge>
                  </Link>
                ) : null}
              </div>

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tags.map((t) => (
                    <Badge key={t} tone="accent" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}

              {(detail.due_at || detail.sla_hours != null || detail.acceptance_reason) && (
                <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1 text-xs">
                  {detail.due_at ? (
                    <>
                      <dt className="text-muted">Due</dt>
                      <dd>{formatDate(detail.due_at)}</dd>
                    </>
                  ) : null}
                  {detail.sla_hours != null ? (
                    <>
                      <dt className="text-muted">SLA</dt>
                      <dd>{detail.sla_hours} ч</dd>
                    </>
                  ) : null}
                  {detail.acceptance_reason ? (
                    <>
                      <dt className="text-muted">Принятие</dt>
                      <dd>
                        {detail.acceptance_reason}
                        {detail.accepted_until
                          ? ` · до ${formatDate(detail.accepted_until)}`
                          : ""}
                      </dd>
                    </>
                  ) : null}
                  {detail.external_ref ? (
                    <>
                      <dt className="text-muted">Ext ref</dt>
                      <dd className="font-mono">{detail.external_ref}</dd>
                    </>
                  ) : null}
                </dl>
              )}

              {(detail.linked_cve_ids || []).length > 0 && (
                <CveIntelStrip cveIds={detail.linked_cve_ids || []} />
              )}

              {(imgUrl || hasVisualEvidence(ev)) && (
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted">
                    Evidence
                  </div>
                  {imgUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imgUrl}
                      alt="Screenshot evidence"
                      className="max-h-[60vh] w-full rounded border border-border object-contain object-top bg-surface2"
                      data-testid="finding-evidence-image"
                    />
                  ) : (
                    <p className="text-muted">Скриншот недоступен (нет файла на API).</p>
                  )}
                  {ev?.artifact_key ? (
                    <p className="break-all font-mono text-[11px] text-muted">{ev.artifact_key}</p>
                  ) : null}
                </div>
              )}

              {metaEntries.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted">
                    Метаданные
                  </div>
                  <dl className="space-y-1 rounded border border-border bg-surface2/40 p-3 font-mono text-[11px]">
                    {metaEntries.map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[7rem_1fr] gap-2">
                        <dt className="text-muted">{k}</dt>
                        <dd className="break-all text-text">
                          {typeof v === "string" || typeof v === "number" || typeof v === "boolean"
                            ? String(v)
                            : JSON.stringify(v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <div className="space-y-2" data-testid="finding-events">
                <div className="text-xs font-medium uppercase tracking-wide text-muted">
                  События
                </div>
                {events.length === 0 ? (
                  <p className="text-xs text-muted">Нет событий</p>
                ) : (
                  <ul className="space-y-2">
                    {events.map((evRow) => (
                      <li
                        key={evRow.id}
                        className="rounded-lg border border-border/70 bg-surface2/30 px-3 py-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="neutral">{evRow.event_type || "event"}</Badge>
                          <span className="text-muted">{formatDate(evRow.created_at)}</span>
                        </div>
                        {evRow.message ? (
                          <p className="mt-1 text-text">{evRow.message}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
      <AcceptanceModal
        open={acceptOpen}
        busy={statusBusy}
        onCancel={() => {
          setAcceptOpen(false);
          setPendingStatus(null);
        }}
        onConfirm={(reason, until) => {
          void applyStatus(pendingStatus || "accepted", {
            acceptance_reason: reason,
            accepted_until: until,
          });
        }}
      />
    </div>
  );
}

function ActionsMenu({
  onExport,
  onRefresh,
  exporting,
  loading,
}: {
  onExport: () => void;
  onRefresh: () => void;
  exporting: boolean;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-text"
        aria-label="Действия"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="findings-actions"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-surface py-1 text-sm shadow-lg">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface2 disabled:opacity-50"
            disabled={exporting || loading}
            onClick={() => {
              setOpen(false);
              onExport();
            }}
          >
            <Download size={14} />
            {exporting ? "Экспорт…" : "Экспорт CSV"}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface2 disabled:opacity-50"
            disabled={loading}
            onClick={() => {
              setOpen(false);
              onRefresh();
            }}
          >
            <RefreshCw size={14} />
            Обновить
          </button>
        </div>
      )}
    </div>
  );
}

export default function FindingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canRead = hasPermission(user, "scan:read");
  const canRun = hasPermission(user, "scan:run");
  const canTicket = canRead && hasPermission(user, "tickets:write");

  const rawScanJob = searchParams.get("scan_job_id");
  const scanJobParsed = rawScanJob ? Number(rawScanJob) : NaN;
  const scanJobId =
    Number.isFinite(scanJobParsed) && scanJobParsed > 0 ? scanJobParsed : null;

  const rawProject = searchParams.get("project_id");
  const projectParsed = rawProject ? Number(rawProject) : NaN;
  const projectId =
    Number.isFinite(projectParsed) && projectParsed > 0 ? projectParsed : null;

  const [searchDraft, setSearchDraft] = useState("");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<ChipFilter[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Finding[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkAcceptOpen, setBulkAcceptOpen] = useState(false);
  const [sortByRisk, setSortByRisk] = useState(true);

  const params = chipsToParams(filters, [
    "severity",
    "status",
    "module_id",
    "priority",
    "overdue",
    "risk_min",
    "tag",
  ]);

  const filterSnapshot: FindingsFilterQuery = { q, filters };

  function applySavedFilter(query: FindingsFilterQuery) {
    setSearchDraft(query.q || "");
    setQ((query.q || "").trim());
    setFilters(Array.isArray(query.filters) ? query.filters : []);
    setPage(1);
  }

  useEffect(() => {
    setPage(1);
  }, [scanJobId, projectId]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const qs = buildQs({
        q,
        severity: params.severity,
        status: params.status,
        module_id: params.module_id,
        priority: params.priority,
        overdue: params.overdue,
        min_risk: params.risk_min || params.min_risk,
        tag: params.tag,
        scan_job_id: scanJobId ?? undefined,
        project_id: projectId ?? undefined,
        sort: sortByRisk ? "risk" : undefined,
        page,
        page_size: PAGE_SIZE,
      });
      const data = await api<ListOut>(`/findings?${qs}`);
      let list = data.results || [];
      // Client-side refine only for filters the current page may still need
      if (params.overdue === "true") {
        list = list.filter(isOverdue);
      } else if (params.overdue === "false") {
        list = list.filter((f) => !isOverdue(f));
      }
      if (params.tag) {
        const tag = params.tag.toLowerCase();
        list = list.filter((f) =>
          (f.tags || []).some((t) => String(t).toLowerCase() === tag),
        );
      }
      setRows(list);
      setTotal(data.total || 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    q,
    params.severity,
    params.status,
    params.module_id,
    params.priority,
    params.overdue,
    params.risk_min,
    params.tag,
    scanJobId,
    projectId,
    page,
    sortByRisk,
  ]);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    load();
  }, [canRead, load]);

  function applyFilters(next: ChipFilter[]) {
    setFilters(next);
    setPage(1);
  }

  function applySearch(value: string) {
    setQ(value.trim());
    setPage(1);
  }

  async function onExport() {
    setExporting(true);
    setErr(null);
    try {
      const qs = buildQs({
        q,
        severity: params.severity,
        status: params.status,
        module_id: params.module_id,
        priority: params.priority,
        overdue: params.overdue,
        risk_min: params.risk_min,
        tag: params.tag,
        scan_job_id: scanJobId ?? undefined,
        project_id: projectId ?? undefined,
        limit: 2000,
      });
      await apiDownload(`/findings/export?${qs}`, {
        filename: scanJobId ? `scan-${scanJobId}-findings.csv` : "findings-export.csv",
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setExporting(false);
    }
  }

  async function createTicket(id: number) {
    setBusyId(`ticket-${id}`);
    setErr(null);
    setMsg(null);
    try {
      const res = await api<{ ticket: TicketOut; warning?: string | null }>(
        `/findings/${id}/ticket`,
        { method: "POST" },
      );
      if (res.warning) setMsg(res.warning);
      else setMsg(`Заявка #${res.ticket.id} создана`);
      await load();
      router.push(`/tickets/${res.ticket.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка создания заявки");
    } finally {
      setBusyId(null);
    }
  }

  function toggleRow(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePageAll() {
    const pageIds = rows.map((r) => r.id);
    const allOn = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOn) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function bulkSetStatus(
    status: string,
    extra?: { acceptance_reason?: string; accepted_until?: string },
  ) {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (status === "accepted" && !extra?.acceptance_reason) {
      setBulkAcceptOpen(true);
      return;
    }
    setBulkBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (status === "accepted" && extra) {
        const until = extra.accepted_until?.includes("T")
          ? extra.accepted_until
          : `${extra.accepted_until}T23:59:59Z`;
        let updated = 0;
        for (const id of ids) {
          await api(`/findings/${id}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: "accepted",
              acceptance_reason: extra.acceptance_reason,
              accepted_until: until,
              reason: extra.acceptance_reason,
            }),
          });
          updated += 1;
        }
        setMsg(`Обновлено: ${updated}`);
      } else {
        const res = await api<{ updated?: number }>("/findings/bulk", {
          method: "POST",
          body: JSON.stringify({ finding_ids: ids, status }),
        });
        setMsg(`Обновлено: ${res.updated ?? ids.length}`);
      }
      setSelectedIds(new Set());
      setBulkAcceptOpen(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка bulk");
    } finally {
      setBulkBusy(false);
    }
  }

  async function promoteToAsset(id: number) {
    setBusyId(`promote-${id}`);
    setErr(null);
    setMsg(null);
    try {
      const res = await api<{
        asset: { id: number };
        message?: string;
      }>(`/findings/${id}/promote-asset`, { method: "POST" });
      setMsg(res.message || `Узел #${res.asset.id}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка добавления в узлы");
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!canRead) {
    return (
      <div className="space-y-4" data-testid="findings-page">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Находки</h1>
        <Card>Нет права scan:read.</Card>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="findings-page">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="font-display text-lg font-semibold tracking-tight">
            {scanJobId ? `Результаты сканирования #${scanJobId}` : "Находки"}
          </h1>
          <span className="text-xs text-muted">
            {total} · сортировка по risk ↓ ·{" "}
            {projectId ? (
              <>
                проект #{projectId}
                {" · "}
                <Link href="/findings" className="text-accent2 hover:underline">
                  Сбросить проект
                </Link>
                {" · "}
              </>
            ) : null}
            {scanJobId ? (
              <>
                <Link href="/findings" className="text-accent2 hover:underline">
                  Все находки
                </Link>
                {" · "}
                <Link href="/scans" className="text-accent2 hover:underline">
                  Сканы
                </Link>
              </>
            ) : (
              <Link href="/assets" className="text-accent2 hover:underline">
                Узлы
              </Link>
            )}
          </span>
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={sortByRisk}
            onChange={(e) => setSortByRisk(e.target.checked)}
          />
          Сорт. по risk
        </label>
      </div>

      {scanJobId != null ? (
        <ScanJobSummaryStrip
          scanJobId={scanJobId}
          canRun={canRun}
          onRetestDone={(newId) => {
            if (newId) {
              setMsg(`Retest: задание #${newId} в очереди`);
              router.push(`/scans`);
            }
          }}
        />
      ) : null}

      <div className="rounded-lg border border-border bg-surface2/40 px-2 py-1.5">
        <ChipFilterBar
          defs={FINDINGS_DEFS}
          filters={filters}
          onChange={applyFilters}
          search={searchDraft}
          onSearchChange={setSearchDraft}
          onSearchSubmit={applySearch}
          searchPlaceholder="заголовок, hostname, IP…"
          trailing={
            <>
              <SavedFiltersMenu current={filterSnapshot} onApply={applySavedFilter} />
              <ActionsMenu
                onExport={onExport}
                onRefresh={load}
                exporting={exporting}
                loading={loading}
              />
            </>
          }
        />
      </div>

      {canRun && selectedIds.size > 0 ? (
        <Card className="flex flex-wrap items-center gap-2 py-2 text-sm">
          <span className="text-muted">Выбрано: {selectedIds.size}</span>
          {BULK_STATUSES.map((s) => (
            <Button
              key={s.value}
              type="button"
              variant="secondary"
              disabled={bulkBusy}
              onClick={() => bulkSetStatus(s.value)}
            >
              → {s.label}
            </Button>
          ))}
          <Button type="button" variant="ghost" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())}>
            Снять выбор
          </Button>
        </Card>
      ) : null}

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
              {canRun ? (
                <th className="w-10 px-2 py-3">
                  <input
                    type="checkbox"
                    aria-label="Выбрать страницу"
                    checked={rows.length > 0 && rows.every((r) => selectedIds.has(r.id))}
                    onChange={togglePageAll}
                  />
                </th>
              ) : null}
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Evidence</th>
              <th className="px-4 py-3">Ресурс</th>
              <th className="px-4 py-3">Hostname</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Заголовок</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">Приоритет</th>
              <th className="px-4 py-3">Критичность</th>
              <th className="px-4 py-3">Теги</th>
              <th className="px-4 py-3">Модуль</th>
              <th className="px-4 py-3">Скан</th>
              <th className="px-4 py-3">CVE / БДУ</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Создано</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const cves = f.linked_cve_ids || [];
              const bdus = f.linked_bdu_ids || [];
              const label = resourceLabel(f);
              return (
                <tr
                  key={String(f.id)}
                  className="cursor-pointer border-b border-border/70 hover:bg-surface2/50"
                  onClick={() => setSelectedId(f.id)}
                >
                  {canRun ? (
                    <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(f.id)}
                        onChange={() => toggleRow(f.id)}
                        aria-label={`Выбрать #${f.id}`}
                      />
                    </td>
                  ) : null}
                  <td className="px-4 py-3 font-mono text-xs">{f.id}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="block"
                      onClick={() => setSelectedId(f.id)}
                      title="Открыть evidence"
                    >
                      <EvidenceThumb finding={f} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {f.asset_id ? (
                      <Link
                        href={`/assets/${f.asset_id}`}
                        className="font-medium text-accent2 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {label || `Узел #${f.asset_id}`}
                      </Link>
                    ) : label ? (
                      <span className="text-text">{label}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {f.asset_hostname || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{f.asset_ip || "—"}</td>
                  <td className="px-4 py-3 font-medium text-text">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{f.title}</span>
                      {(f.occurrence_count || 1) > 1 && (
                        <Badge tone="neutral" title={f.fingerprint || undefined}>
                          ×{f.occurrence_count}
                        </Badge>
                      )}
                      {isOverdue(f) ? <Badge tone="danger">overdue</Badge> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {f.risk_score != null ? f.risk_score : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {f.priority ? (
                      <Badge tone={priorityTone(f.priority)}>{f.priority}</Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {f.severity ? (
                      <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(f.tags || []).length
                        ? (f.tags || []).map((t) => (
                            <Badge key={t} tone="accent" className="text-[10px]">
                              {t}
                            </Badge>
                          ))
                        : (
                          <span className="text-muted">—</span>
                        )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{f.module_id || "—"}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {f.scan_job_id != null ? (
                      <Link
                        href={`/findings?scan_job_id=${f.scan_job_id}`}
                        className="font-mono text-xs text-accent2 hover:underline"
                        title="Находки этого скана"
                      >
                        #{f.scan_job_id}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {cves.map((cve) => (
                        <Link
                          key={cve}
                          href={`/vuln/${encodeURIComponent(cve)}`}
                          className="text-accent2 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {cve}
                        </Link>
                      ))}
                      {bdus.map((bdu) => (
                        <Link
                          key={bdu}
                          href={`/bdu/${encodeURIComponent(bdu)}`}
                          className="text-accent2 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {bdu}
                        </Link>
                      ))}
                      {!cves.length && !bdus.length ? (
                        <span className="text-muted">—</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {f.status ? <Badge>{f.status}</Badge> : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{formatDate(f.created_at)}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap items-center gap-1">
                      {canRun ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busyId === `promote-${f.id}`}
                          onClick={() => promoteToAsset(f.id)}
                          title="В узлы"
                        >
                          <Server size={14} />
                          {busyId === `promote-${f.id}` ? "…" : "В узлы"}
                        </Button>
                      ) : null}
                      {f.ticket_id ? (
                        <Link
                          href={`/tickets/${f.ticket_id}`}
                          className="text-sm text-accent2 hover:underline"
                        >
                          #{f.ticket_id}
                        </Link>
                      ) : canTicket ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busyId === `ticket-${f.id}`}
                          onClick={() => createTicket(f.id)}
                        >
                          <Ticket size={14} />
                          {busyId === `ticket-${f.id}` ? "…" : "В заявку"}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && <p className="p-4 text-sm text-muted">Загрузка…</p>}
        {!loading && !rows.length && (
          <p className="p-4 text-sm text-muted">Нет находок по текущим фильтрам.</p>
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
          <span className="text-xs text-muted">
            {page}/{totalPages}
          </span>
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

      {selectedId != null && (
        <FindingDetailPanel
          findingId={selectedId}
          onClose={() => setSelectedId(null)}
          canRun={canRun}
          onUpdated={load}
        />
      )}

      <AcceptanceModal
        open={bulkAcceptOpen}
        busy={bulkBusy}
        onCancel={() => setBulkAcceptOpen(false)}
        onConfirm={(reason, until) => {
          void bulkSetStatus("accepted", {
            acceptance_reason: reason,
            accepted_until: until,
          });
        }}
      />
    </div>
  );
}
