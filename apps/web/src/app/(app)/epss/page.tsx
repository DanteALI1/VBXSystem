"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, TrendingUp } from "lucide-react";
import { api, apiDownload, hasPermission } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { severityTone } from "@/lib/severity";

type Row = {
  cve_id: string;
  score: number;
  percentile: number;
  scored_at: string;
  severity: string;
  title: string;
  is_cisa_kev?: boolean;
  href: string;
  previous_score?: number | null;
  delta?: number | null;
};

type Overview = {
  top_predictions: Row[];
  top_deltas: Row[];
  total_scored: number;
};

export default function EpssPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const canSync = hasPermission(user, "vuln:sync");

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      setData(await api<Overview>("/epss?limit=25"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function syncEpss() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await api<{ message: string }>("/epss/sync", { method: "POST" });
      setMsg(res.message);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка sync");
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    setExporting(true);
    setErr(null);
    try {
      await apiDownload("/epss/export?limit=100", { filename: "epss-export.csv" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="epss-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">EPSS</h1>
          <p className="mt-1 text-sm text-muted">
            Exploit Prediction Scoring System — топ прогнозов и лидеры по дельте.
            {data ? ` Оценено CVE: ${data.total_scored}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onExport} disabled={exporting || loading}>
            <Download size={14} />
            {exporting ? "…" : "CSV"}
          </Button>
          <Button type="button" variant="secondary" onClick={load}>
            <RefreshCw size={14} />
            Обновить
          </Button>
          {canSync && (
            <Button type="button" onClick={syncEpss} disabled={busy}>
              {busy ? "Синхронизация…" : "Синхронизировать EPSS"}
            </Button>
          )}
        </div>
      </div>

      {err && (
        <Card className="border-danger/40 text-sm text-danger" role="alert">
          {err}
        </Card>
      )}
      {msg && <Card className="text-sm text-ok">{msg}</Card>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
            <TrendingUp size={16} /> Топ прогнозов
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="pb-2 font-medium">CVE</th>
                  <th className="pb-2 font-medium">EPSS</th>
                  <th className="pb-2 font-medium">pctl</th>
                  <th className="pb-2 font-medium">Крит.</th>
                </tr>
              </thead>
              <tbody>
                {(data?.top_predictions || []).map((r) => (
                  <tr key={r.cve_id} className="border-t border-border">
                    <td className="py-2">
                      <Link href={r.href} className="text-accent2 hover:underline">
                        {r.cve_id}
                      </Link>
                      {r.is_cisa_kev && (
                        <Badge tone="warn" className="ml-2">
                          KEV
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 font-medium">{(r.score * 100).toFixed(2)}%</td>
                    <td className="py-2 text-muted">p{Math.round(r.percentile * 100)}</td>
                    <td className="py-2">
                      {r.severity && <Badge tone={severityTone(r.severity)}>{r.severity}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.top_predictions?.length && (
              <p className="text-sm text-muted">
                {loading ? "Загрузка…" : "Нет оценок. Запустите синхронизацию EPSS."}
              </p>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-display text-lg font-semibold">Лидеры по дельте</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="pb-2 font-medium">CVE</th>
                  <th className="pb-2 font-medium">Оценка</th>
                  <th className="pb-2 font-medium">Δ</th>
                </tr>
              </thead>
              <tbody>
                {(data?.top_deltas || []).map((r) => (
                  <tr key={r.cve_id} className="border-t border-border">
                    <td className="py-2">
                      <Link href={r.href} className="text-accent2 hover:underline">
                        {r.cve_id}
                      </Link>
                    </td>
                    <td className="py-2">{(r.score * 100).toFixed(2)}%</td>
                    <td
                      className={`py-2 font-medium ${(r.delta || 0) >= 0 ? "text-danger" : "text-ok"}`}
                      title="Рост EPSS — выше риск"
                    >
                      {(r.delta || 0) >= 0 ? "+" : ""}
                      {((r.delta || 0) * 100).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.top_deltas?.length && (
              <p className="text-sm text-muted">
                {loading ? "Загрузка…" : "Нет дельт (нужна история оценок)."}
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
