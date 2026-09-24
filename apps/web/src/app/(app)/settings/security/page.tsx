"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
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

export default function SecuritySettingsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Security | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [actionFilter, setActionFilter] = useState("");
  const [caPem, setCaPem] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canEdit = !!user?.is_super_admin;

  async function load() {
    const s = await api<Security>("/settings/security");
    setData(s);
    const a = await api<Audit[]>("/settings/security/audit?limit=40");
    setAudit(a);
  }

  useEffect(() => {
    load().catch((e) => setErr(e.message));
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

  async function filterAudit() {
    const q = actionFilter.trim() ? `?action=${encodeURIComponent(actionFilter.trim())}&limit=40` : "?limit=40";
    setAudit(await api<Audit[]>(`/settings/security/audit${q}`));
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
          API client certificate (mTLS) — включено
          {data.mtls_ca_configured && (
            <Badge tone="ok" className="ml-2">
              CA загружен
            </Badge>
          )}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Инструкции mTLS</span>
          <textarea
            className="min-h-[80px] w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm"
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
              className="min-h-[100px] w-full rounded-xl border border-border bg-bg px-3 py-2 font-mono text-xs"
              placeholder="-----BEGIN CERTIFICATE-----"
              value={caPem}
              onChange={(e) => setCaPem(e.target.value)}
            />
            <Button type="submit">Сохранить CA</Button>
          </form>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <h2 className="font-display text-lg font-semibold">Журнал аудита</h2>
          <div className="ml-auto flex gap-2">
            <Input label="Фильтр action" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} />
            <Button type="button" variant="secondary" onClick={filterAudit}>
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
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="border-t border-border align-top">
                  <td className="py-2 text-xs text-muted">{formatDate(a.created_at)}</td>
                  <td className="py-2">{a.actor_user_id ?? "—"}</td>
                  <td className="py-2 font-mono text-xs">{a.action}</td>
                  <td className="py-2 text-xs text-muted">{a.resource}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
