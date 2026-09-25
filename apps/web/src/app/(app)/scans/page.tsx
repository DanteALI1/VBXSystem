"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronDown, Plus, RefreshCw, RotateCw, Square, Trash2 } from "lucide-react";
import { api, hasPermission } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatDate } from "@/lib/severity";

type ModuleRow = {
  id: string;
  name?: string | null;
  online?: boolean;
  enabled?: boolean;
  status?: string | null;
  capabilities?: string[] | Record<string, unknown> | null;
};

type ScanJob = {
  id: number;
  module_id: string;
  status: string;
  params?: Record<string, unknown> | null;
  error?: string | null;
  progress?: Record<string, unknown> | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_by?: number | null;
};

type ScanSchedule = {
  id: number;
  name: string;
  module_id: string;
  params?: Record<string, unknown> | null;
  interval_sec: number;
  enabled: boolean;
  last_run_at?: string | null;
  next_run_at?: string | null;
};

type ScanStats = {
  running_jobs: number;
  queued_jobs: number;
  cancelled_jobs: number;
  stale_leases_reclaimed: number;
  findings_created: number;
  allowlist_denials_enqueue: number;
  allowlist_denials_ingest: number;
  jobs_cancelled: number;
  claim_wait_last_ms: number;
  claim_wait_avg_ms: number | null;
  claim_latency_last_ms: number;
  claim_latency_avg_ms: number | null;
  lease_ttl_sec: number;
};

const KNOWN_MODULES: { id: string; name: string }[] = [
  { id: "nmap", name: "Nmap" },
  { id: "shodan", name: "Shodan" },
  { id: "zap", name: "OWASP ZAP" },
  { id: "nuclei", name: "Nuclei" },
  { id: "gowitness", name: "gowitness" },
];

const NMAP_PROFILES = [
  { value: "quick", label: "Быстрый" },
  { value: "default", label: "Обычный" },
  { value: "full", label: "Полный" },
  { value: "udp", label: "UDP" },
  { value: "vuln-scripts", label: "NSE vuln" },
];
const SHODAN_MODES = [
  { value: "host", label: "Хост" },
  { value: "search", label: "Поиск" },
  { value: "dns", label: "DNS" },
];
const ZAP_SCAN_TYPES = [
  { value: "baseline", label: "Baseline" },
  { value: "spider", label: "Spider" },
  { value: "full", label: "Full" },
  { value: "api", label: "API" },
];

const CANCELLABLE = new Set(["pending", "queued", "running"]);
const SUCCESS = new Set(["succeeded", "success", "completed", "done"]);

function asList<T>(data: unknown, keys: string[] = ["results", "jobs"]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const k of keys) {
      if (Array.isArray(o[k])) return o[k] as T[];
    }
  }
  return [];
}

function isOnline(m: ModuleRow): boolean {
  if (typeof m.online === "boolean") return m.online;
  const s = (m.status || "").toLowerCase();
  return s === "online" || s === "ready" || s === "active";
}

function mergeModuleList(apiModules: ModuleRow[]): ModuleRow[] {
  const byId = new Map<string, ModuleRow>();
  for (const k of KNOWN_MODULES) {
    byId.set(k.id, { id: k.id, name: k.name, online: false, enabled: true });
  }
  for (const m of apiModules) {
    const prev = byId.get(m.id);
    byId.set(m.id, {
      ...prev,
      ...m,
      name: m.name || prev?.name || m.id,
    });
  }
  const knownIds = KNOWN_MODULES.map((k) => k.id);
  const known = knownIds.map((id) => byId.get(id)!);
  const extras = [...byId.values()]
    .filter((m) => !knownIds.includes(m.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  return [...known, ...extras];
}

function jobTarget(job: ScanJob): string {
  const p = job.params || {};
  const t = p.target ?? p.host ?? p.ip ?? p.hostname ?? p.query;
  return typeof t === "string" && t ? t : "—";
}

function jobSummary(job: ScanJob): string {
  const p = job.params || {};
  const bits: string[] = [];
  if (typeof p.profile === "string" && p.profile) bits.push(`профиль=${p.profile}`);
  if (typeof p.mode === "string" && p.mode) bits.push(`режим=${p.mode}`);
  if (typeof p.scan_type === "string" && p.scan_type) bits.push(`тип=${p.scan_type}`);
  if (typeof p.tags === "string" && p.tags) bits.push(`tags=${p.tags}`);
  if (typeof p.severity === "string" && p.severity) bits.push(`sev=${p.severity}`);
  if (typeof p.resolution === "string" && p.resolution) bits.push(`res=${p.resolution}`);
  if (p.fullpage === true) bits.push("fullpage");
  if (typeof p.timeout === "number") bits.push(`timeout=${p.timeout}`);
  else if (typeof p.timeout === "string" && p.timeout) bits.push(`timeout=${p.timeout}`);
  if (typeof p.ports === "string" && p.ports) bits.push(`порты=${p.ports}`);
  else if (Array.isArray(p.ports)) bits.push(`порты=${p.ports.join(",")}`);
  return bits.length ? bits.join(" · ") : "—";
}

function statusTone(status: string): "neutral" | "ok" | "warn" | "danger" | "accent" {
  const s = status.toLowerCase();
  if (SUCCESS.has(s)) return "ok";
  if (s === "failed" || s === "error" || s === "cancelled" || s === "canceled" || s === "aborted")
    return "danger";
  if (s === "running" || s === "processing") return "accent";
  if (s === "queued" || s === "pending") return "warn";
  return "neutral";
}

const STATUS_LABEL: Record<string, string> = {
  queued: "в очереди",
  pending: "ожидание",
  running: "выполняется",
  succeeded: "успех",
  success: "успех",
  completed: "завершён",
  done: "готово",
  failed: "ошибка",
  cancelled: "отменён",
  canceled: "отменён",
  aborted: "прерван",
};

function fmtMs(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (v < 1000) return `${Math.round(v)} мс`;
  return `${(v / 1000).toFixed(1)} с`;
}

function Advanced({ children }: { children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-border/80 bg-surface2/30">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-sm text-muted marker:content-none [&::-webkit-details-marker]:hidden">
        <ChevronDown
          size={14}
          className="shrink-0 transition-transform group-open:rotate-180"
        />
        Дополнительно
      </summary>
      <div className="space-y-3 border-t border-border/60 px-3 py-3">{children}</div>
    </details>
  );
}

export default function ScansPage() {
  const { user } = useAuth();
  const canRead = hasPermission(user, "scan:read");
  const canRun = hasPermission(user, "scan:run");

  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [jobs, setJobs] = useState<ScanJob[]>([]);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastJobId, setLastJobId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"jobs" | "schedule">("jobs");
  const [schedules, setSchedules] = useState<ScanSchedule[]>([]);
  const [schedName, setSchedName] = useState("");
  const [schedModule, setSchedModule] = useState("nmap");
  const [schedTarget, setSchedTarget] = useState("");
  const [schedInterval, setSchedInterval] = useState("3600");
  const [schedEnabled, setSchedEnabled] = useState(true);
  const [schedBusy, setSchedBusy] = useState(false);
  const [retestingId, setRetestingId] = useState<number | null>(null);

  const [moduleId, setModuleId] = useState("nmap");
  const [target, setTarget] = useState("");
  // nmap
  const [nmapProfile, setNmapProfile] = useState("default");
  const [ports, setPorts] = useState("");
  const [timing, setTiming] = useState("3");
  const [topPorts, setTopPorts] = useState("");
  const [scripts, setScripts] = useState("");
  const [exclude, setExclude] = useState("");
  const [sv, setSv] = useState(false);
  const [osDetect, setOsDetect] = useState(false);
  const [aggressive, setAggressive] = useState(false);
  // shodan
  const [shodanMode, setShodanMode] = useState("host");
  const [query, setQuery] = useState("");
  // zap
  const [zapScanType, setZapScanType] = useState("baseline");
  const [ajaxSpider, setAjaxSpider] = useState(false);
  const [maxDuration, setMaxDuration] = useState("");
  const [contextName, setContextName] = useState("");
  const [contextUser, setContextUser] = useState("");
  const [openapi, setOpenapi] = useState("");
  // gowitness
  const [gwTimeout, setGwTimeout] = useState("");
  const [gwResolution, setGwResolution] = useState("");
  const [gwFullpage, setGwFullpage] = useState(false);
  // nuclei
  const [nucleiTemplates, setNucleiTemplates] = useState("");
  const [nucleiSelectedTags, setNucleiSelectedTags] = useState<string[]>([]);
  const [nucleiTagOptions, setNucleiTagOptions] = useState<{ tag: string; count: number }[]>([]);
  const [nucleiCustomNames, setNucleiCustomNames] = useState("");
  const [nucleiCustomOptions, setNucleiCustomOptions] = useState<string[]>([]);
  const [nucleiExcludeTags, setNucleiExcludeTags] = useState("");
  const [nucleiSeverity, setNucleiSeverity] = useState("");
  const [nucleiRateLimit, setNucleiRateLimit] = useState("");
  const [nucleiConcurrency, setNucleiConcurrency] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [credentials, setCredentials] = useState<{ id: number; name: string; kind: string }[]>([]);

  const knownIds = useMemo(() => new Set(KNOWN_MODULES.map((k) => k.id)), []);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const [mods, jobData, statsData, schedData] = await Promise.all([
        api<unknown>("/modules"),
        api<unknown>("/modules/jobs"),
        api<ScanStats>("/modules/stats").catch(() => null),
        api<ScanSchedule[]>("/settings/scan-schedules").catch(() => []),
      ]);
      const moduleList = mergeModuleList(asList<ModuleRow>(mods, ["results", "modules"]));
      setModules(moduleList);
      setJobs(asList<ScanJob>(jobData, ["results", "jobs"]));
      setStats(statsData);
      setSchedules(Array.isArray(schedData) ? schedData : []);
      setModuleId((prev) => {
        if (prev && moduleList.some((m) => m.id === prev)) return prev;
        const online = moduleList.find((m) => isOnline(m) && m.enabled !== false);
        return online?.id || moduleList[0]?.id || "nmap";
      });
      try {
        const credData = await api<{ credentials?: { id: number; name: string; kind: string }[] }>(
          "/settings/scan-credentials",
        );
        setCredentials(Array.isArray(credData?.credentials) ? credData.credentials : []);
      } catch {
        setCredentials([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
      setModules(mergeModuleList([]));
      setJobs([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    load();
  }, [canRead, load]);

  useEffect(() => {
    if (moduleId !== "nuclei" || !canRead) return;
    let cancelled = false;
    (async () => {
      try {
        const [catalog, custom] = await Promise.all([
          api<{ tags?: { tag: string; count: number }[] }>("/modules/nuclei/templates?page_size=1"),
          api<{ templates?: { id: string; path: string; source: string }[] }>(
            "/modules/nuclei/templates?source=custom&page_size=100",
          ),
        ]);
        if (cancelled) return;
        setNucleiTagOptions(Array.isArray(catalog?.tags) ? catalog.tags.slice(0, 80) : []);
        const names = (custom?.templates || [])
          .filter((t) => t.source === "custom")
          .map((t) => t.path || `${t.id}.yaml`)
          .filter(Boolean);
        setNucleiCustomOptions(names);
      } catch {
        if (!cancelled) {
          setNucleiTagOptions([]);
          setNucleiCustomOptions([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [moduleId, canRead]);

  async function retestJob(jobId: number) {
    setRetestingId(jobId);
    setErr(null);
    setMsg(null);
    try {
      const job = await api<ScanJob>(`/modules/jobs/${jobId}/retest`, { method: "POST" });
      setMsg(`Retest: задание #${job?.id ?? "?"} в очереди`);
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка retest");
    } finally {
      setRetestingId(null);
    }
  }

  async function createSchedule(e: FormEvent) {
    e.preventDefault();
    if (!schedModule.trim()) return;
    const interval = Number(schedInterval);
    if (!Number.isFinite(interval) || interval < 60) {
      setErr("Интервал не менее 60 сек");
      return;
    }
    setSchedBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const params: Record<string, unknown> = {};
      if (schedTarget.trim()) params.target = schedTarget.trim();
      await api("/settings/scan-schedules", {
        method: "POST",
        body: JSON.stringify({
          module_id: schedModule,
          name: schedName.trim() || `${schedModule} schedule`,
          params,
          interval_sec: interval,
          enabled: schedEnabled,
        }),
      });
      setMsg("Расписание создано");
      setSchedName("");
      setSchedTarget("");
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка расписания");
    } finally {
      setSchedBusy(false);
    }
  }

  async function toggleSchedule(id: number, enabled: boolean) {
    setSchedBusy(true);
    setErr(null);
    try {
      await api(`/settings/scan-schedules/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    } finally {
      setSchedBusy(false);
    }
  }

  async function deleteSchedule(id: number) {
    setSchedBusy(true);
    setErr(null);
    try {
      await api(`/settings/scan-schedules/${id}`, { method: "DELETE" });
      setMsg(`Расписание #${id} удалено`);
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка удаления");
    } finally {
      setSchedBusy(false);
    }
  }

  function fmtInterval(sec: number): string {
    if (sec < 3600) return `${Math.round(sec / 60)} мин`;
    if (sec < 86400) return `${(sec / 3600).toFixed(1)} ч`;
    return `${(sec / 86400).toFixed(1)} д`;
  }

  async function cancelJob(jobId: number) {
    setCancellingId(jobId);
    setErr(null);
    setMsg(null);
    try {
      await api(`/modules/jobs/${jobId}/cancel`, { method: "POST" });
      setMsg(`Задание #${jobId} отменено`);
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка отмены");
    } finally {
      setCancellingId(null);
    }
  }

  async function createJob(e: FormEvent) {
    e.preventDefault();
    if (!moduleId) return;
    const needsTarget = !(moduleId === "shodan" && shodanMode === "search" && query.trim());
    if (needsTarget && !target.trim() && !query.trim()) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    setLastJobId(null);
    try {
      const params: Record<string, unknown> = {};
      if (target.trim()) params.target = target.trim();

      if (moduleId === "nmap") {
        params.profile = nmapProfile;
        if (ports.trim()) params.ports = ports.trim();
        if (timing !== "") params.timing = Number(timing);
        if (topPorts.trim()) params.top_ports = topPorts.trim();
        if (scripts.trim()) params.scripts = scripts.trim();
        if (exclude.trim()) params.exclude = exclude.trim();
        if (sv) params.service_detection = true;
        if (osDetect) params.os_detection = true;
        if (aggressive) params.aggressive = true;
      } else if (moduleId === "shodan") {
        params.mode = shodanMode;
        if (query.trim()) params.query = query.trim();
        if (!params.target && query.trim() && shodanMode !== "search") {
          params.target = query.trim();
        }
      } else if (moduleId === "zap") {
        params.scan_type = zapScanType;
        if (ajaxSpider) params.ajax_spider = true;
        if (maxDuration.trim()) params.max_duration = Number(maxDuration);
        if (contextName.trim() || contextUser.trim()) {
          params.auth = {
            context_name: contextName.trim() || undefined,
            user: contextUser.trim() || undefined,
          };
          if (contextName.trim()) params.context_name = contextName.trim();
          if (contextUser.trim()) params.context_user = contextUser.trim();
        }
        if (openapi.trim()) params.openapi = openapi.trim();
        if (credentialId.trim()) params.credential_id = Number(credentialId);
      } else if (moduleId === "nuclei") {
        const customList = nucleiCustomNames
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const templateParts = [
          ...(nucleiTemplates.trim() ? [nucleiTemplates.trim()] : []),
          ...customList,
        ];
        if (templateParts.length) params.templates = templateParts.join(",");
        if (nucleiSelectedTags.length) params.tags = nucleiSelectedTags.join(",");
        if (nucleiExcludeTags.trim()) params.exclude_tags = nucleiExcludeTags.trim();
        if (nucleiSeverity.trim()) params.severity = nucleiSeverity.trim();
        if (nucleiRateLimit.trim()) params.rate_limit = Number(nucleiRateLimit);
        if (nucleiConcurrency.trim()) params.concurrency = Number(nucleiConcurrency);
      } else if (moduleId === "gowitness") {
        if (gwTimeout.trim()) params.timeout = Number(gwTimeout);
        if (gwResolution.trim()) params.resolution = gwResolution.trim();
        if (gwFullpage) params.fullpage = true;
      } else if (ports.trim()) {
        params.ports = ports.trim();
      }

      const created = await api<ScanJob>(`/modules/${encodeURIComponent(moduleId)}/jobs`, {
        method: "POST",
        body: JSON.stringify({ params }),
      });
      setLastJobId(created?.id ?? null);
      setMsg(`Задание #${created?.id ?? "?"} поставлено в очередь`);
      setShowForm(false);
      setTarget("");
      setPorts("");
      setQuery("");
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка создания");
    } finally {
      setBusy(false);
    }
  }

  if (!canRead) {
    return (
      <div className="space-y-4" data-testid="scans-page">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Сканы</h1>
          <p className="mt-1 text-sm text-muted">Очередь заданий модулей сканирования.</p>
        </div>
        <Card>
          Нет права scan:read. Обратитесь к администратору, чтобы просматривать задания сканирования.
        </Card>
      </div>
    );
  }

  const targetLabel =
    moduleId === "zap" || moduleId === "nuclei" || moduleId === "gowitness"
      ? "URL / хост / IP"
      : moduleId === "shodan" && shodanMode === "search"
        ? "Цель (опционально)"
        : moduleId === "shodan" && shodanMode === "dns"
          ? "Hostname(s)"
          : "Цель (IP / хост)";

  return (
    <div className="space-y-6" data-testid="scans-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Сканы</h1>
          <p className="mt-1 text-sm text-muted">Очередь заданий модулей сканирования.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            <Button
              type="button"
              variant={tab === "jobs" ? "primary" : "ghost"}
              className="px-3 py-1.5 text-xs"
              onClick={() => setTab("jobs")}
            >
              Задания
            </Button>
            <Button
              type="button"
              variant={tab === "schedule" ? "primary" : "ghost"}
              className="px-3 py-1.5 text-xs"
              onClick={() => setTab("schedule")}
            >
              <CalendarClock size={14} />
              Расписание
            </Button>
          </div>
          <Button type="button" variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} />
            Обновить
          </Button>
          {canRun && tab === "jobs" && (
            <Button type="button" onClick={() => setShowForm((v) => !v)}>
              <Plus size={14} />
              Новое задание
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <div
          className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-border bg-surface2/60 px-4 py-3 text-xs text-muted"
          data-testid="scans-stats"
        >
          <span>
            Активных: <strong className="text-text">{stats.running_jobs}</strong>
          </span>
          <span>
            В очереди: <strong className="text-text">{stats.queued_jobs}</strong>
          </span>
          <span>
            Находок: <strong className="text-text">{stats.findings_created}</strong>
          </span>
          <span>
            Lease reclaim: <strong className="text-text">{stats.stale_leases_reclaimed}</strong>
          </span>
          <span>
            Allowlist deny:{" "}
            <strong className="text-text">
              {stats.allowlist_denials_enqueue + stats.allowlist_denials_ingest}
            </strong>
          </span>
          <span>
            Claim wait:{" "}
            <strong className="text-text">
              {fmtMs(stats.claim_wait_avg_ms)} / last {fmtMs(stats.claim_wait_last_ms)}
            </strong>
          </span>
          <span>
            TTL lease: <strong className="text-text">{stats.lease_ttl_sec}с</strong>
          </span>
        </div>
      )}

      {err && (
        <Card className="border-danger/40 text-sm text-danger" role="alert">
          {err}
        </Card>
      )}
      {msg && (
        <Card className="text-sm text-ok" role="status">
          {msg}
          {lastJobId != null && (
            <>
              {" · "}
              <Link
                href={`/findings?scan_job_id=${lastJobId}`}
                className="text-accent2 underline-offset-2 hover:underline"
              >
                Открыть результаты сканирования
              </Link>
            </>
          )}
        </Card>
      )}

      {tab === "schedule" && (
        <div className="space-y-4">
          {canRun && (
            <Card>
              <h2 className="mb-3 font-display text-lg font-semibold">Новое расписание</h2>
              <form onSubmit={createSchedule} className="flex flex-wrap items-end gap-3">
                <Input label="Название" value={schedName} onChange={(e) => setSchedName(e.target.value)} />
                <label className="block space-y-1.5">
                  <span className="text-sm text-muted">Модуль</span>
                  <select
                    className="vbx-field min-w-[140px]"
                    value={schedModule}
                    onChange={(e) => setSchedModule(e.target.value)}
                  >
                    {modules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.id}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Цель (params.target)"
                  value={schedTarget}
                  onChange={(e) => setSchedTarget(e.target.value)}
                  placeholder="192.168.1.10"
                />
                <Input
                  label="Интервал (сек)"
                  type="number"
                  min={60}
                  value={schedInterval}
                  onChange={(e) => setSchedInterval(e.target.value)}
                />
                <label className="inline-flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={schedEnabled}
                    onChange={(e) => setSchedEnabled(e.target.checked)}
                  />
                  Включено
                </label>
                <Button type="submit" disabled={schedBusy}>
                  {schedBusy ? "…" : "Создать"}
                </Button>
              </form>
            </Card>
          )}
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Название</th>
                  <th className="px-4 py-3">Модуль</th>
                  <th className="px-4 py-3">Цель</th>
                  <th className="px-4 py-3">Интервал</th>
                  <th className="px-4 py-3">След. запуск</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => {
                  const target =
                    typeof s.params?.target === "string" ? s.params.target : "—";
                  return (
                    <tr key={s.id} className="border-b border-border/70">
                      <td className="px-4 py-3 font-mono text-xs">{s.id}</td>
                      <td className="px-4 py-3">{s.name || "—"}</td>
                      <td className="px-4 py-3">{s.module_id}</td>
                      <td className="px-4 py-3 font-mono text-xs">{target}</td>
                      <td className="px-4 py-3 text-xs">{fmtInterval(s.interval_sec)}</td>
                      <td className="px-4 py-3 text-xs text-muted">{formatDate(s.next_run_at)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={s.enabled ? "ok" : "neutral"}>
                          {s.enabled ? "вкл" : "выкл"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {canRun ? (
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              className="px-2 py-1 text-xs"
                              disabled={schedBusy}
                              onClick={() => toggleSchedule(s.id, !s.enabled)}
                            >
                              {s.enabled ? "Выключить" : "Включить"}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="px-2 py-1 text-xs text-danger"
                              disabled={schedBusy}
                              onClick={() => deleteSchedule(s.id)}
                            >
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!schedules.length && (
              <p className="p-4 text-sm text-muted">Расписаний пока нет.</p>
            )}
          </Card>
        </div>
      )}

      {tab === "jobs" && canRun && showForm && (
        <Card>
          <h2 className="mb-3 font-display text-lg font-semibold">Создать задание</h2>
          <form onSubmit={createJob} className="space-y-4" data-testid="scans-create-form">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block space-y-1.5">
                <span className="text-sm text-muted">Модуль</span>
                <select
                  className="vbx-field min-w-[180px]"
                  value={moduleId}
                  onChange={(e) => setModuleId(e.target.value)}
                  required
                  data-testid="scans-module-select"
                >
                  {modules.map((m) => (
                    <option key={m.id} value={m.id} disabled={m.enabled === false}>
                      {m.name || m.id}
                      {m.enabled === false ? " (выкл)" : isOnline(m) ? "" : " (offline)"}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label={targetLabel}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={
                  moduleId === "zap" || moduleId === "nuclei" || moduleId === "gowitness"
                    ? "http://scan-target"
                    : moduleId === "shodan" && shodanMode === "search"
                      ? "опционально"
                      : "192.168.1.10"
                }
                required={!(moduleId === "shodan" && shodanMode === "search")}
              />
            </div>

            {moduleId === "nmap" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-sm text-muted">Профиль</span>
                    <select
                      className="vbx-field min-w-[140px]"
                      value={nmapProfile}
                      onChange={(e) => setNmapProfile(e.target.value)}
                    >
                      {NMAP_PROFILES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Input
                    label="Порты"
                    value={ports}
                    onChange={(e) => setPorts(e.target.value)}
                    placeholder="22,80,443"
                  />
                </div>
                <Advanced>
                  <div className="flex flex-wrap items-end gap-3">
                    <Input
                      label="Timing (-T0…5)"
                      type="number"
                      min={0}
                      max={5}
                      value={timing}
                      onChange={(e) => setTiming(e.target.value)}
                    />
                    <Input
                      label="Top-ports"
                      value={topPorts}
                      onChange={(e) => setTopPorts(e.target.value)}
                      placeholder="100"
                    />
                    <Input
                      label="NSE scripts"
                      value={scripts}
                      onChange={(e) => setScripts(e.target.value)}
                      placeholder="vuln,safe"
                    />
                    <Input
                      label="Exclude"
                      value={exclude}
                      onChange={(e) => setExclude(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={sv} onChange={(e) => setSv(e.target.checked)} />
                      -sV (сервисы)
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={osDetect}
                        onChange={(e) => setOsDetect(e.target.checked)}
                      />
                      -O (ОС)
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={aggressive}
                        onChange={(e) => setAggressive(e.target.checked)}
                      />
                      -A (агрессивный)
                    </label>
                  </div>
                </Advanced>
              </div>
            )}

            {moduleId === "shodan" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-sm text-muted">Режим</span>
                    <select
                      className="vbx-field min-w-[140px]"
                      value={shodanMode}
                      onChange={(e) => setShodanMode(e.target.value)}
                    >
                      {SHODAN_MODES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Input
                    label={shodanMode === "search" ? "Запрос" : "Запрос (опционально)"}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={
                      shodanMode === "search"
                        ? 'port:443 org:"Example"'
                        : shodanMode === "dns"
                          ? "host1.example,host2.example"
                          : ""
                    }
                    required={shodanMode === "search" && !target.trim()}
                  />
                </div>
              </div>
            )}

            {moduleId === "zap" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-sm text-muted">Тип скана</span>
                    <select
                      className="vbx-field min-w-[140px]"
                      value={zapScanType}
                      onChange={(e) => setZapScanType(e.target.value)}
                    >
                      {ZAP_SCAN_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-2 pb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={ajaxSpider}
                      onChange={(e) => setAjaxSpider(e.target.checked)}
                    />
                    Ajax spider
                  </label>
                </div>
                <Advanced>
                  <div className="flex flex-wrap items-end gap-3">
                    <Input
                      label="Макс. длительность (сек)"
                      type="number"
                      min={30}
                      max={7200}
                      value={maxDuration}
                      onChange={(e) => setMaxDuration(e.target.value)}
                      placeholder="по умолчанию"
                    />
                    <Input
                      label="Контекст (имя)"
                      value={contextName}
                      onChange={(e) => setContextName(e.target.value)}
                    />
                    <Input
                      label="Контекст (пользователь)"
                      value={contextUser}
                      onChange={(e) => setContextUser(e.target.value)}
                    />
                    {zapScanType === "api" && (
                      <Input
                        label="OpenAPI URL/путь"
                        value={openapi}
                        onChange={(e) => setOpenapi(e.target.value)}
                        placeholder="https://…/openapi.json"
                      />
                    )}
                    {credentials.length > 0 && (
                      <label className="block space-y-1.5">
                        <span className="text-sm text-muted">Учётные данные (vault)</span>
                        <select
                          className="vbx-field min-w-[180px]"
                          value={credentialId}
                          onChange={(e) => setCredentialId(e.target.value)}
                        >
                          <option value="">— нет —</option>
                          {credentials.map((c) => (
                            <option key={c.id} value={String(c.id)}>
                              #{c.id} {c.name} ({c.kind})
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </Advanced>
              </div>
            )}

            {moduleId === "nuclei" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="text-xs text-muted">Теги шаблонов (каталог)</div>
                  <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-lg border border-border bg-surface2/40 p-2">
                    {nucleiTagOptions.length === 0 && (
                      <span className="text-xs text-muted">
                        Нет индекса — синхронизируйте шаблоны в Настройки → Модули
                      </span>
                    )}
                    {nucleiTagOptions.map((t) => {
                      const on = nucleiSelectedTags.includes(t.tag);
                      return (
                        <label
                          key={t.tag}
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                            on
                              ? "border-accent bg-accent/10 text-text"
                              : "border-border text-muted hover:border-accent/40"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={on}
                            onChange={() =>
                              setNucleiSelectedTags((prev) =>
                                on ? prev.filter((x) => x !== t.tag) : [...prev, t.tag],
                              )
                            }
                          />
                          <span className="font-mono">{t.tag}</span>
                          <span className="opacity-60">{t.count}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <Input
                    label="Custom templates (имена .yaml)"
                    value={nucleiCustomNames}
                    onChange={(e) => setNucleiCustomNames(e.target.value)}
                    placeholder={
                      nucleiCustomOptions[0]
                        ? nucleiCustomOptions.slice(0, 3).join(", ")
                        : "my-check.yaml"
                    }
                    list="nuclei-custom-templates"
                  />
                  <datalist id="nuclei-custom-templates">
                    {nucleiCustomOptions.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                  <Input
                    label="Шаблоны (путь override)"
                    value={nucleiTemplates}
                    onChange={(e) => setNucleiTemplates(e.target.value)}
                    placeholder="/app/artifacts/nuclei-templates"
                  />
                </div>
                <Advanced>
                  <div className="flex flex-wrap items-end gap-3">
                    <Input
                      label="Исключить теги"
                      value={nucleiExcludeTags}
                      onChange={(e) => setNucleiExcludeTags(e.target.value)}
                      placeholder="dos,fuzz"
                    />
                    <Input
                      label="Критичность"
                      value={nucleiSeverity}
                      onChange={(e) => setNucleiSeverity(e.target.value)}
                      placeholder="critical,high,medium"
                    />
                    <Input
                      label="Rate limit"
                      type="number"
                      min={1}
                      max={10000}
                      value={nucleiRateLimit}
                      onChange={(e) => setNucleiRateLimit(e.target.value)}
                      placeholder="150"
                    />
                    <Input
                      label="Concurrency (-c)"
                      type="number"
                      min={1}
                      max={500}
                      value={nucleiConcurrency}
                      onChange={(e) => setNucleiConcurrency(e.target.value)}
                      placeholder="25"
                    />
                  </div>
                </Advanced>
              </div>
            )}

            {moduleId === "gowitness" && (
              <div className="space-y-3">
                <p className="text-sm text-muted">Скриншот HTTP(S) цели.</p>
                <Advanced>
                  <div className="flex flex-wrap items-end gap-3">
                    <Input
                      label="Таймаут (сек)"
                      type="number"
                      min={10}
                      max={600}
                      value={gwTimeout}
                      onChange={(e) => setGwTimeout(e.target.value)}
                      placeholder="по умолчанию"
                    />
                    <Input
                      label="Разрешение (Ш×В)"
                      value={gwResolution}
                      onChange={(e) => setGwResolution(e.target.value)}
                      placeholder="1440x900"
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={gwFullpage}
                      onChange={(e) => setGwFullpage(e.target.checked)}
                    />
                    Полная страница
                  </label>
                </Advanced>
              </div>
            )}

            {!knownIds.has(moduleId) && (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Модуль из API — передаётся цель; дополнительные поля зависят от sidecar.
                </p>
                <Advanced>
                  <Input
                    label="Порты (если поддерживается)"
                    value={ports}
                    onChange={(e) => setPorts(e.target.value)}
                    placeholder="22,80,443"
                  />
                </Advanced>
              </div>
            )}

            <Button type="submit" disabled={busy || !moduleId}>
              {busy ? "Отправка…" : "Запустить"}
            </Button>
          </form>
        </Card>
      )}

      {tab === "jobs" && (
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-muted">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Модуль</th>
              <th className="px-4 py-3">Цель</th>
              <th className="px-4 py-3">Параметры</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Создано</th>
              <th className="px-4 py-3">Завершено</th>
              <th className="px-4 py-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const ok = SUCCESS.has(j.status.toLowerCase());
              return (
                <tr key={String(j.id)} className="border-b border-border/70">
                  <td className="px-4 py-3 font-mono text-xs">{j.id}</td>
                  <td className="px-4 py-3">{j.module_id}</td>
                  <td className="px-4 py-3 font-mono text-xs">{jobTarget(j)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{jobSummary(j)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(j.status)}>
                      {STATUS_LABEL[j.status.toLowerCase()] || j.status}
                    </Badge>
                    {j.error ? (
                      <div className="mt-1 max-w-xs truncate text-xs text-danger" title={j.error}>
                        {j.error}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{formatDate(j.created_at)}</td>
                  <td className="px-4 py-3 text-xs text-muted">{formatDate(j.finished_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {ok && (
                        <Link
                          href={`/findings?scan_job_id=${j.id}`}
                          className="text-xs text-accent2 hover:underline"
                        >
                          Открыть результаты сканирования
                        </Link>
                      )}
                      {canRun && ok ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="px-2 py-1 text-xs"
                          disabled={retestingId === j.id}
                          onClick={() => retestJob(j.id)}
                        >
                          <RotateCw size={12} />
                          {retestingId === j.id ? "…" : "Retest"}
                        </Button>
                      ) : null}
                      {canRun && CANCELLABLE.has(j.status.toLowerCase()) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="px-2 py-1 text-xs text-danger"
                          disabled={cancellingId === j.id}
                          onClick={() => cancelJob(j.id)}
                          title="Отменить задание"
                        >
                          <Square size={12} />
                          {cancellingId === j.id ? "…" : "Отмена"}
                        </Button>
                      ) : !ok ? (
                        <span className="text-xs text-muted">—</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && <p className="p-4 text-sm text-muted">Загрузка…</p>}
        {!loading && !jobs.length && (
          <p className="p-4 text-sm text-muted">
            Заданий пока нет.
            {canRun ? " Создайте первое через «Новое задание»." : ""}
          </p>
        )}
      </Card>
      )}
    </div>
  );
}
