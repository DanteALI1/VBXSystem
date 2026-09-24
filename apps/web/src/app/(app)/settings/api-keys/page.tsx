"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatDate } from "@/lib/severity";

type KeyRow = {
  id: number;
  name: string;
  prefix: string;
  scopes: string[];
  expires_at?: string | null;
  revoked_at?: string | null;
  last_used_at?: string | null;
  created_at?: string | null;
};

export default function ApiKeysPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<KeyRow[]>([]);
  const [name, setName] = useState("integration");
  const [secretOnce, setSecretOnce] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const canManage =
    !!user && (user.is_super_admin || user.roles.includes("admin") || user.roles.includes("super_admin"));

  async function load() {
    setRows(await api<KeyRow[]>("/settings/api-keys"));
  }

  useEffect(() => {
    if (!canManage) return;
    load().catch((e) => setErr(e.message));
  }, [canManage]);

  if (!canManage) {
    return <Card>Управление API-ключами доступно администраторам.</Card>;
  }

  async function createKey(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setSecretOnce(null);
    try {
      const res = await api<KeyRow & { secret: string }>("/settings/api-keys", {
        method: "POST",
        body: JSON.stringify({ name, scopes: ["vuln:read"], expires_days: 90 }),
      });
      setSecretOnce(res.secret);
      setMsg("Ключ создан — скопируйте secret сейчас, он больше не отобразится.");
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  async function revoke(id: number) {
    await api(`/settings/api-keys/${id}/revoke`, { method: "POST" });
    setMsg("Ключ отозван");
    await load();
  }

  return (
    <div className="space-y-4" data-testid="settings-api-keys">
      {err && <Card className="border-danger/40 text-sm text-danger">{err}</Card>}
      {msg && <Card className="text-sm text-ok">{msg}</Card>}
      {secretOnce && (
        <Card className="border-warn/40 bg-warn/5" data-testid="api-key-secret">
          <div className="text-sm font-medium text-warn">Secret (один раз)</div>
          <code className="mt-2 block break-all font-mono text-sm">{secretOnce}</code>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 font-display text-lg font-semibold">Создать API ключ</h2>
        <form onSubmit={createKey} className="flex flex-wrap items-end gap-3">
          <Input label="Имя" value={name} onChange={(e) => setName(e.target.value)} required />
          <Button type="submit">Создать</Button>
        </form>
        <p className="mt-2 text-xs text-muted">Scope по умолчанию: vuln:read. Передавайте как Bearer или X-API-Key.</p>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Prefix</th>
              <th className="px-4 py-3">Scopes</th>
              <th className="px-4 py-3">Last used</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/70">
                <td className="px-4 py-3">{r.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.prefix}…</td>
                <td className="px-4 py-3">
                  {r.scopes.map((s) => (
                    <Badge key={s} className="mr-1">
                      {s}
                    </Badge>
                  ))}
                </td>
                <td className="px-4 py-3 text-xs text-muted">{formatDate(r.last_used_at)}</td>
                <td className="px-4 py-3">
                  {r.revoked_at ? <Badge tone="danger">revoked</Badge> : <Badge tone="ok">active</Badge>}
                </td>
                <td className="px-4 py-3">
                  {!r.revoked_at && (
                    <Button type="button" variant="ghost" onClick={() => revoke(r.id)}>
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-4 text-sm text-muted">Ключей пока нет.</p>}
      </Card>
    </div>
  );
}
