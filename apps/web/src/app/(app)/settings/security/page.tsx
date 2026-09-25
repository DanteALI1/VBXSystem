"use client";

import { FormEvent, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { api, apiDownload } from "@/lib/api";
import { buildQs } from "@/lib/queryString";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatDate } from "@/lib/severity";

type Security = {
  force_2fa: boolean;
  new_device_alerts: boolean;
  mtls_enabled: boolean;
  mtls_ca_configured: boolean;
  mtls_instructions: string;
};

type Audit = {
  id: number;
  actor_user_id?: number | null;
  action: string;
  resource: string;
  details: string;
  ip_address?: string | null;
  created_at?: string | null;
};

function auditQuery(params: {
  action: string;
  actor: string;
  dateFrom: string;
  dateTo: string;
  limit?: number;
}): string {
  const qs = buildQs({
    action: params.action,
    user_id: params.actor,
    date_from: params.dateFrom,
    date_to: params.dateTo ? `${params.dateTo}T23:59:59` : undefined,
    limit: params.limit ?? 80,
  });
  return qs ? `?${qs}` : "";
}

export default function SecuritySettingsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Security | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [caPem, setCaPem] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canEdit = !!user?.is_super_admin;

  async function loadAudit() {
    const q = auditQuery({
      action: actionFilter,
      actor: actorFilter,
      dateFrom,
      dateTo,
      limit: 80,
    });
    setAudit(await api<Audit[]>(`/settings/security/audit${q}`));
  }

  async function load() {
    const s = await api<Security>("/settings/security");
    setData(s);
    await loadAudit();
  }

  useEffect(() => {
    load().catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!data) return;
    setErr(null);
    try {
      const res = await api<Security>("/settings/security", {
        method: "PUT",
        body: JSON.stringify({
          force_2fa: data.force_2fa,
          new_device_alerts: data.new_device_alerts,
          mtls_enabled: data.mtls_enabled,
          mtls_instructions: data.mtls_instructions,
        }),
      });
      setData(res);
      setMsg("Политики сохранены");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }

  async function uploadCa(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await api<{ message: string }>("/settings/security/mtls-ca", {
        method: "PUT",
        body: JSON.stringify({ ca_pem: caPem }),
      });
      setMsg(res.message);
      setCaPem("");
      await load();
    } catch (err2) {
      setErr(err2 instanceof Error ? err2.message : "Ошибка");
    }
  }

  async function exportAuditCsv() {
    setErr(null);
    try {
      const q = auditQuery({
        action: actionFilter,
        actor: actorFilter,
        dateFrom,
        dateTo,
        limit: 5000,
      });
      await apiDownload(`/settings/security/audit/export${q}`, {
        filename: "audit-export.csv",
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка экспорта");
    }
  }

  if (!data) return <div className="text-sm text-muted">Загрузка…</div>;

  return (
    <div className="space-y-4" data-testid="settings-security">
      {err && <Card className="border-danger/40 text-sm text-danger">{err}</Card>}
      {msg && <Card className="text-sm text-ok">{msg}</Card>}

      <Card className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Политики безопасности</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={data.force_2fa}
            disabled={!canEdit}
            onChange={(e) => setData({ ...data, force_2fa: e.target.checked })}
          />
          Принудительная 2FA для всех
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={data.new_device_alerts}
            disabled={!canEdit}
            onChange={(e) => setData({ ...data, new_device_alerts: e.target.checked })}
          />
          Оповещения о входе с нового устройства
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={data.mtls_enabled}
            disabled={!canEdit}
            onChange={(e) => setData({ ...data, mtls_enabled: e.target.checked })}
          />
          API client certificate (mTLS) — политика / CA storage
          <Badge tone="warn" className="ml-2">
            через reverse-proxy
          </Badge>
          {data.mtls_ca_configured && (
            <Badge tone="ok" className="ml-2">
              CA загружен
            </Badge>
          )}
        </label>
        <div className="rounded-lg border border-border/80 bg-surface2/40 px-3 py-2 text-xs leading-relaxed text-muted">
          <p className="font-medium text-text">mTLS: только edge / reverse-proxy</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li>Включите verify client на nginx/Traefik/HAProxy с вашим org CA.</li>
            <li>CA PEM ниже — инвентарь и документация; прокси должен загрузить тот же CA.</li>
            <li>Не открывайте FastAPI :8000 наружу без прокси; VBX не проверяет client cert сам.</li>
          </ul>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Инструкции mTLS</span>
          <textarea
            className="vbx-field min-h-[100px]"
            value={data.mtls_instructions}
            disabled={!canEdit}
            onChange={(e) => setData({ ...data, mtls_instructions: e.target.value })}
          />
        </label>
        {canEdit && (
          <Button type="button" onClick={save}>
            Сохранить политики
          </Button>
        )}
      </Card>

      {canEdit && (
        <Card>
          <h2 className="mb-2 font-display text-lg font-semibold">Загрузка CA (PEM)</h2>
          <form onSubmit={uploadCa} className="space-y-2">
            <textarea
              className="vbx-field min-h-[100px] font-mono text-xs"
              placeholder="-----BEGIN CERTIFICATE-----"
              value={caPem}
              onChange={(e) => setCaPem(e.target.value)}
            />
            <Button type="submit">Сохранить CA</Button>
          </form>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Журнал аудита</h2>
          <Button type="button" variant="secondary" onClick={() => void exportAuditCsv()}>
            <Download size={14} />
            CSV
          </Button>
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            label="Action"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="security.update"
          />
          <Input
            label="Actor user id"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            placeholder="1"
          />
          <Input
            label="Date from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <Input
            label="Date to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => loadAudit().catch((e) => setErr(e.message))}
            >
              Фильтр
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="pb-2">Когда</th>
                <th className="pb-2">User</th>
                <th className="pb-2">Action</th>
                <th className="pb-2">Resource</th>
                <th className="pb-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="border-t border-border align-top">
                  <td className="py-2 text-xs text-muted">{formatDate(a.created_at)}</td>
                  <td className="py-2">{a.actor_user_id ?? "—"}</td>
                  <td className="py-2 font-mono text-xs">{a.action}</td>
                  <td className="py-2 text-xs text-muted">{a.resource}</td>
                  <td className="py-2 text-xs text-muted">{a.ip_address || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
