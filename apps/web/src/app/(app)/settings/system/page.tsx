"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type Metrics = {
  collected_at: string;
  cpu: { percent: number; count: number; load_1: number; load_5: number; load_15: number };
  ram: { total: number; used: number; available: number; percent: number };
  swap: { total: number; used: number; free: number; percent: number };
  disk_root: { total: number; used: number; free: number; percent: number };
  disks: Array<{ device: string; mount: string; percent: number; total: number; used: number }>;
};

function fmtBytes(n: number) {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function Meter({ label, percent, detail }: { label: string; percent: number; detail: string }) {
  const p = Math.min(100, Math.max(0, percent || 0));
  const tone = p >= 90 ? "bg-danger" : p >= 75 ? "bg-warn" : "bg-accent";
  return (
    <div className="rounded-xl border border-border/80 bg-surface2/40 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-medium">{label}</div>
        <div className="font-mono text-lg font-semibold text-accent2">{p.toFixed(0)}%</div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg">
        <div className={`h-full rounded-full ${tone} transition-all`} style={{ width: `${p}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">{detail}</p>
    </div>
  );
}

export default function SystemSettingsPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canAdmin = !!user && (user.is_super_admin || user.roles.includes("admin"));

  const reload = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      setData(await api<Metrics>("/settings/system/metrics"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!canAdmin) return;
    void reload();
    const t = setInterval(() => void reload(), 15000);
    return () => clearInterval(t);
  }, [canAdmin, reload]);

  if (loading) return <div className="text-sm text-muted">Загрузка…</div>;
  if (!canAdmin) return <Card>Раздел доступен администратору.</Card>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Система</h2>
          <p className="text-sm text-muted">
            Метрики хоста API-контейнера (CPU / RAM / SWAP / Disk)
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void reload()} disabled={busy}>
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          Обновить
        </Button>
      </div>
      {err ? (
        <Card className="border-danger/40 text-danger" role="alert">
          {err}
        </Card>
      ) : null}
      {data ? (
        <>
          <p className="text-xs text-muted">
            Снято: {new Date(data.collected_at).toLocaleString("ru-RU")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Meter
              label="CPU"
              percent={data.cpu.percent}
              detail={`${data.cpu.count} vCPU · load ${data.cpu.load_1.toFixed(2)} / ${data.cpu.load_5.toFixed(2)} / ${data.cpu.load_15.toFixed(2)}`}
            />
            <Meter
              label="RAM"
              percent={data.ram.percent}
              detail={`${fmtBytes(data.ram.used)} / ${fmtBytes(data.ram.total)}`}
            />
            <Meter
              label="SWAP"
              percent={data.swap.percent}
              detail={`${fmtBytes(data.swap.used)} / ${fmtBytes(data.swap.total)}`}
            />
            <Meter
              label="Disk /"
              percent={data.disk_root.percent}
              detail={`${fmtBytes(data.disk_root.used)} / ${fmtBytes(data.disk_root.total)}`}
            />
          </div>
          {data.disks.length > 0 ? (
            <Card>
              <h3 className="text-sm font-semibold">Тома</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="pb-2 pr-3 font-medium">Mount</th>
                      <th className="pb-2 pr-3 font-medium">Device</th>
                      <th className="pb-2 pr-3 font-medium">Used</th>
                      <th className="pb-2 font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.disks.map((d) => (
                      <tr key={`${d.mount}-${d.device}`} className="border-t border-border/60">
                        <td className="py-2 pr-3 font-mono text-xs">{d.mount}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-muted">{d.device}</td>
                        <td className="py-2 pr-3 text-xs">
                          {fmtBytes(d.used)} / {fmtBytes(d.total)}
                        </td>
                        <td className="py-2 font-mono text-xs">{d.percent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </>
      ) : (
        <div className="text-sm text-muted">Загрузка метрик…</div>
      )}
    </div>
  );
}
