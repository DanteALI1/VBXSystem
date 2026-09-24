"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bookmark,
  Database,
  ExternalLink,
  Search,
  ShieldAlert,
  Terminal,
  Ticket,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatDate, severityTone } from "@/lib/severity";
import type { DashboardData, DashHit, EpssHit, WidgetType } from "./types";

const REASON_LABEL: Record<string, { label: string; tone: "warn" | "danger" | "ok" | "neutral" | "accent" }> = {
  watchlist: { label: "Watchlist", tone: "accent" },
  kev_new: { label: "KEV 7д", tone: "warn" },
  kev: { label: "KEV", tone: "warn" },
  epss: { label: "EPSS", tone: "danger" },
  critical: { label: "Critical", tone: "danger" },
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

function SyncPill({
  label,
  item,
}: {
  label: string;
  item: DashboardData["sync_health"][string];
}) {
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

function AttentionRow({ h }: { h: DashHit }) {
  const text = (h.summary || h.title || "").trim();
  const showText = text && text.toUpperCase() !== h.id.toUpperCase();
  const reason = h.reason || (h.is_cisa_kev ? "kev" : "critical");
  const reasonMeta = REASON_LABEL[reason] || { label: reason, tone: "neutral" as const };
  const highlight = reason === "watchlist" || reason === "kev_new" || reason === "kev";

  return (
    <li>
      <Link
        href={h.href}
        className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2 transition ${
          highlight ? "border-warn/40 bg-warn/5 hover:border-warn" : "border-border hover:border-accent/40"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{h.id}</span>
            <Badge tone={reasonMeta.tone}>{reasonMeta.label}</Badge>
            {h.severity && (
              <Badge tone={severityTone(h.severity)}>
                {h.severity}
                {h.cvss_score != null ? ` ${h.cvss_score}` : ""}
              </Badge>
            )}
          </div>
          {showText && <p className="mt-1 text-sm text-muted line-clamp-1">{text}</p>}
        </div>
        <TrendingUp size={14} className={`mt-1 shrink-0 ${highlight ? "text-warn" : "text-accent2"}`} />
      </Link>
    </li>
  );
}

function HitList({
  title,
  items,
  empty,
}: {
  title: string;
  items: DashHit[];
  empty: string;
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-auto">
        {items.map((h) => (
          <li key={h.id}>
            <Link href={h.href} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2 py-1.5 text-sm hover:border-accent/40">
              <span className="font-mono font-medium">{h.id}</span>
              {h.cvss_score != null && <Badge tone="danger">{h.cvss_score}</Badge>}
            </Link>
          </li>
        ))}
        {!items.length && <li className="text-sm text-muted">{empty}</li>}
      </ul>
    </Card>
  );
}

function EpssList({
  title,
  items,
  showDelta,
}: {
  title: string;
  items: EpssHit[];
  showDelta?: boolean;
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-auto">
        {items.map((e) => (
          <li key={e.cve_id}>
            <Link
              href={e.href}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-2 py-1.5 text-sm hover:border-accent/40"
            >
              <span className="min-w-0 truncate font-mono">{e.cve_id}</span>
              <span className="shrink-0 text-xs text-muted">
                {showDelta && e.delta != null ? (
                  <span className={e.delta >= 0 ? "text-danger" : "text-ok"}>
                    {e.delta >= 0 ? "+" : ""}
                    {e.delta.toFixed(3)}
                  </span>
                ) : (
                  e.score.toFixed(3)
                )}
              </span>
            </Link>
          </li>
        ))}
        {!items.length && <li className="text-sm text-muted">Нет EPSS данных</li>}
      </ul>
    </Card>
  );
}

type Props = {
  type: WidgetType;
  data: DashboardData | null;
  range: string;
  onRange?: (r: string) => void;
  compact?: boolean;
};

export function DashboardWidget({ type, data, range, onRange, compact }: Props) {
  const feed = data?.attention_feed?.length
    ? data.attention_feed
    : [...(data?.recent_kev || []), ...(data?.recent_critical || [])].slice(0, 12);
  const windowDays = data?.attention_window_days ?? 30;
  const epssMin = data?.attention_epss_min ?? 0.7;

  if (type === "kpi_cve") {
    return (
      <Card className="h-full">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Activity size={14} /> CVE сегодня
        </div>
        <div className="mt-2 font-display text-3xl font-semibold">{data?.kpis.cves_today ?? "—"}</div>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted">
          за 7 дней: {data?.kpis.cves_week ?? "—"} <Delta v={data?.kpis.cves_week_delta_pct} />
        </div>
      </Card>
    );
  }

  if (type === "kpi_cve_week") {
    return (
      <Card className="h-full">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Activity size={14} /> CVE за 7 дней
        </div>
        <div className="mt-2 font-display text-3xl font-semibold">{data?.kpis.cves_week ?? "—"}</div>
        <div className="mt-2 text-sm text-muted">
          vs пред. неделя <Delta v={data?.kpis.cves_week_delta_pct} />
        </div>
      </Card>
    );
  }

  if (type === "kpi_kev") {
    return (
      <Card className="h-full">
        <div className="flex items-center gap-2 text-sm text-muted">
          <ShieldAlert size={14} /> CISA KEV
        </div>
        <div className="mt-2 font-display text-3xl font-semibold">{data?.kpis.kev_week ?? "—"}</div>
        <div className="mt-2 text-sm text-muted">
          всего флагов: {data?.kpis.kev_total ?? "—"} · каталог: {data?.kpis.kev_catalog ?? "—"}
        </div>
      </Card>
    );
  }

  if (type === "kpi_kev_catalog") {
    return (
      <Card className="h-full">
        <div className="text-sm text-muted">Каталог CISA KEV</div>
        <div className="mt-2 font-display text-3xl font-semibold">{data?.kpis.kev_catalog ?? "—"}</div>
      </Card>
    );
  }

  if (type === "kpi_strip") {
    return (
      <Card className="h-full">
        <div className="grid h-full grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-muted">CVE сегодня</div>
            <div className="font-display text-2xl font-semibold">{data?.kpis.cves_today ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted">CVE / 7д</div>
            <div className="font-display text-2xl font-semibold">{data?.kpis.cves_week ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted">KEV</div>
            <div className="font-display text-2xl font-semibold">{data?.kpis.kev_week ?? "—"}</div>
          </div>
        </div>
      </Card>
    );
  }

  if (type === "catalog_stats") {
    const s = data?.catalog_stats;
    return (
      <Card className="h-full">
        <div className="text-sm text-muted">Объём каталога</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted">CVE</div>
            <div className="font-display text-xl font-semibold">{s?.cve_total ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted">БДУ</div>
            <div className="font-display text-xl font-semibold">{s?.bdu_total ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Local</div>
            <div className="font-display text-xl font-semibold">{s?.local_total ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted">EPSS</div>
            <div className="font-display text-xl font-semibold">{s?.epss_scored ?? "—"}</div>
          </div>
        </div>
      </Card>
    );
  }

  if (type === "sync_health") {
    return (
      <Card className="h-full overflow-auto">
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
    );
  }

  if (type === "sync_nvd") {
    return (
      <Card className="h-full">
        <SyncPill label="NVD" item={data?.sync_health.nvd ?? null} />
      </Card>
    );
  }

  if (type === "sync_bdu") {
    return (
      <Card className="h-full">
        <SyncPill label="BDU" item={data?.sync_health.bdu ?? null} />
      </Card>
    );
  }

  if (type === "activity_chart") {
    const maxAct = Math.max(1, ...(data?.activity.map((a) => a.count) || [1]));
    return (
      <Card className="flex h-full flex-col">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Активность CVE</h2>
          <div className="flex gap-1">
            {["1M", "6M", "1Y"].map((r) => (
              <Button
                key={r}
                type="button"
                variant={range === r ? "primary" : "ghost"}
                className="px-3 py-1.5"
                onClick={() => onRange?.(r)}
              >
                {r}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-end gap-1" data-testid="activity-chart">
          {(data?.activity || []).map((a) => {
            const barPx = Math.max(4, Math.round((a.count / maxAct) * 100));
            return (
              <div
                key={a.date}
                className="group relative flex min-w-0 flex-1 flex-col items-center justify-end"
                title={`${a.date}: ${a.count}`}
              >
                <div
                  className="w-full rounded-t-md bg-accent2/90 transition group-hover:bg-accent2"
                  style={{ height: `${barPx}%`, minHeight: 4 }}
                />
              </div>
            );
          })}
          {!data?.activity?.length && <div className="text-sm text-muted">Нет данных</div>}
        </div>
      </Card>
    );
  }

  if (type === "attention_feed" || type === "attention_compact") {
    const items = type === "attention_compact" ? feed.slice(0, 6) : feed;
    return (
      <Card className="flex h-full flex-col overflow-hidden" data-testid="attention-feed">
        <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <AlertTriangle size={16} className="text-warn" />
              Требует внимания
            </h2>
            {!compact && (
              <p className="mt-1 text-sm text-muted">
                watchlist → KEV 7д → EPSS≥{epssMin} → Critical · {windowDays} дн.
              </p>
            )}
          </div>
          <Badge tone="neutral">{items.length}</Badge>
        </div>
        <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-auto">
          {items.map((h) => (
            <AttentionRow key={h.id} h={h} />
          ))}
          {!items.length && <li className="text-sm text-muted">Нет совпадений</li>}
        </ul>
      </Card>
    );
  }

  if (type === "list_recent_critical") {
    return (
      <HitList
        title="Critical ≥ 9.0"
        items={data?.recent_critical || []}
        empty="Нет critical в ленте"
      />
    );
  }

  if (type === "list_recent_kev") {
    return <HitList title="KEV в ленте" items={data?.recent_kev || []} empty="Нет KEV в ленте" />;
  }

  if (type === "list_epss_top") {
    return <EpssList title="EPSS Top" items={data?.epss_top || []} />;
  }

  if (type === "list_epss_deltas") {
    return <EpssList title="EPSS изменения" items={data?.epss_deltas || []} showDelta />;
  }

  if (type === "quick_links") {
    const links = [
      { href: "/search", label: "Search", icon: Search },
      { href: "/cveql", label: "CVEQL", icon: Terminal },
      { href: "/epss", label: "EPSS", icon: TrendingUp },
      { href: "/tickets", label: "Заявки", icon: Ticket },
      { href: "/settings/watchlist", label: "Watchlist", icon: Bookmark },
    ];
    return (
      <Card className="h-full">
        <div className="mb-2 text-sm text-muted">Быстрые ссылки</div>
        <div className="flex flex-wrap gap-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface2 px-3 py-2 text-sm hover:border-accent/40"
            >
              <l.icon size={14} />
              {l.label}
              <ExternalLink size={12} className="text-muted" />
            </Link>
          ))}
        </div>
      </Card>
    );
  }

  if (type === "watchlist_cta") {
    return (
      <Card className="flex h-full flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <Bookmark size={14} /> Watchlist
          </div>
          <p className="mt-2 text-sm text-muted">
            Добавьте vendor/product/CVE — они поднимутся в ленту «Требует внимания».
          </p>
        </div>
        <Link href="/settings/watchlist" className="mt-3 text-sm text-accent2 hover:underline">
          Настроить watchlist →
        </Link>
      </Card>
    );
  }

  return (
    <Card className="h-full text-sm text-muted">Неизвестный виджет: {type}</Card>
  );
}
