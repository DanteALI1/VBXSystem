"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Database, RefreshCw, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatDate, severityTone } from "@/lib/severity";

type Hit = {
  id: string;
  title: string;
  severity: string;
  cvss_score?: number | null;
  published_at?: string | null;
  is_cisa_kev: boolean;
  href: string;
};

type Dashboard = {
  kpis: {
    cves_today: number;
    cves_today_delta_pct?: number | null;
    cves_week: number;
    cves_week_delta_pct?: number | null;
    kev_week: number;
    kev_total: number;
    kev_catalog: number;
  };
  chart_range: string;
  activity: { date: string; count: number }[];
  recent_critical: Hit[];
  recent_kev: Hit[];
  sync_health: Record<string, { source: string; status: string; finished_at?: string | null; error?: string } | null>;
};

function Delta({ v }: { v?: number | null }) {
  if (v == null) return null;
  const tone = v > 0 ? "text-ok" : v < 0 ? "text-danger" : "text-muted";
  const sign = v > 0 ? "+" : "";
  return (
    <span className={`text-xs ${tone}`}>
      {sign}
      {v}%
    </span>
  );
}

function SyncPill({ label, item }: { label: string; item: Dashboard["sync_health"][string] }) {
  if (!item) {
    return (
      <div className="rounded-xl border border-border bg-surface2/60 px-3 py-2 text-sm">
        <div className="text-muted">{label}</div>
        <div className="mt-1">Нет данных</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-surface2/60 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted">{label}</span>
        <Badge tone={item.status === "success" ? "ok" : "warn"}>{item.status}</Badge>
      </div>
      <div className="mt-1 text-xs text-muted">{formatDate(item.finished_at)}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [range, setRange] = useState("1M");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r: string) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api<Dashboard>(`/dashboard?chart_range=${encodeURIComponent(r)}`);
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [load, range]);

  const maxAct = Math.max(1, ...(data?.activity.map((a) => a.count) || [1]));

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="vbx-page-title">Dashboard</h1>
          <p className="vbx-page-sub">KPI, активность CVE и здоровье источников данных.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => load(range)} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Обновить
        </Button>
      </div>

      {err && (
        <Card className="border-danger/40 text-sm text-danger" role="alert">
          {err}
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-2 text-sm text-muted">
            <Activity size={14} /> CVE (окно)
          </div>
          <div className="mt-2 font-display text-3xl font-semibold">{data?.kpis.cves_today ?? "—"}</div>
          <div className="mt-2 flex items-center gap-2 text-sm text-muted">
            неделя: {data?.kpis.cves_week ?? "—"} <Delta v={data?.kpis.cves_week_delta_pct} />
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-sm text-muted">
            <ShieldAlert size={14} /> CISA KEV
          </div>
          <div className="mt-2 font-display text-3xl font-semibold">{data?.kpis.kev_week ?? "—"}</div>
          <div className="mt-2 text-sm text-muted">
            всего флагов: {data?.kpis.kev_total ?? "—"} · каталог: {data?.kpis.kev_catalog ?? "—"}
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-sm text-muted">
            <Database size={14} /> Синхронизация
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <SyncPill label="NVD" item={data?.sync_health.nvd ?? null} />
            <SyncPill label="BDU" item={data?.sync_health.bdu ?? null} />
            <SyncPill label="KEV" item={data?.sync_health.kev ?? null} />
            <SyncPill label="EPSS" item={data?.sync_health.epss ?? null} />
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Активность CVE</h2>
          <div className="flex gap-1">
            {["1M", "6M", "1Y"].map((r) => (
              <Button
                key={r}
                type="button"
                variant={range === r ? "primary" : "ghost"}
                className="px-3 py-1.5"
                onClick={() => setRange(r)}
              >
                {r}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex h-36 items-end gap-1" data-testid="activity-chart" aria-label="График активности">
          {(data?.activity || []).map((a) => (
            <div key={a.date} className="group relative flex min-w-0 flex-1 flex-col items-center justify-end">
              <div
                className="w-full rounded-t-md bg-accent/70 transition group-hover:bg-accent"
                style={{ height: `${Math.max(4, (a.count / maxAct) * 100)}%` }}
                title={`${a.date}: ${a.count}`}
              />
            </div>
          ))}
          {!data?.activity?.length && <div className="text-sm text-muted">Нет данных за период</div>}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-display text-lg font-semibold">Recent critical</h2>
          <ul className="space-y-2">
            {(data?.recent_critical || []).map((h) => (
              <li key={h.id}>
                <Link href={h.href} className="flex items-start justify-between gap-2 rounded-xl border border-border px-3 py-2 hover:border-accent/40">
                  <div>
                    <div className="font-medium">{h.id}</div>
                    <div className="text-xs text-muted line-clamp-1">{h.title}</div>
                  </div>
                  <Badge tone={severityTone(h.severity)}>
                    {h.severity}
                    {h.cvss_score != null ? ` ${h.cvss_score}` : ""}
                  </Badge>
                </Link>
              </li>
            ))}
            {!data?.recent_critical?.length && <li className="text-sm text-muted">Нет записей</li>}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
            <AlertTriangle size={16} className="text-warn" /> Recent KEV
          </h2>
          <ul className="space-y-2">
            {(data?.recent_kev || []).map((h) => (
              <li key={h.id}>
                <Link
                  href={h.href}
                  className="flex items-start justify-between gap-2 rounded-xl border border-warn/40 bg-warn/5 px-3 py-2 hover:border-warn"
                >
                  <div>
                    <div className="font-medium">{h.id}</div>
                    <div className="text-xs text-muted line-clamp-1">{h.title}</div>
                  </div>
                  <Badge tone="warn">KEV</Badge>
                </Link>
              </li>
            ))}
            {!data?.recent_kev?.length && <li className="text-sm text-muted">Нет KEV</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
