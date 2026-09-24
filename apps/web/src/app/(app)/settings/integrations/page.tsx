"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type Integrations = {
  smtp: {
    host: string;
    port: number;
    use_tls: boolean;
    username: string;
    password_masked: string;
    from_addr: string;
  };
  ldap: {
    host: string;
    port: number;
    use_tls: boolean;
    bind_dn: string;
    base_dn: string;
    user_filter: string;
    group_filter: string;
    mock_mode: boolean;
  };
  sso: {
    enabled: boolean;
    provider: string;
    client_id: string;
    issuer_url: string;
    authorize_url: string;
    token_url: string;
    staging: boolean;
  };
};

export default function IntegrationsPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<Integrations | null>(null);
  const [smtpPass, setSmtpPass] = useState("");
  const [ldapPass, setLdapPass] = useState("");
  const [ssoSecret, setSsoSecret] = useState("");
  const [testTo, setTestTo] = useState("admin@example.local");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setData(await api<Integrations>("/settings/integrations"));
  }

  useEffect(() => {
    if (!user?.is_super_admin) return;
    load().catch((e) => setErr(e.message));
  }, [user?.is_super_admin]);

  if (loading) return <div className="text-sm text-muted">Загрузка…</div>;
  if (!user?.is_super_admin) {
    return <Card>Раздел доступен главному администратору.</Card>;
  }

  async function saveSmtp(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    try {
      const res = await api<{ message: string }>("/settings/integrations/smtp", {
        method: "PUT",
        body: JSON.stringify({
          host: data.smtp.host,
          port: data.smtp.port,
          use_tls: data.smtp.use_tls,
          username: data.smtp.username,
          from_addr: data.smtp.from_addr,
          password: smtpPass || undefined,
        }),
      });
      setMsg(res.message);
      setSmtpPass("");
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  async function testSmtp() {
    try {
      const res = await api<{ message: string }>("/settings/integrations/smtp/test", {
        method: "POST",
        body: JSON.stringify({ to: testTo }),
      });
      setMsg(res.message);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка SMTP");
    }
  }

  async function saveLdap(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    try {
      const res = await api<{ message: string }>("/settings/integrations/ldap", {
        method: "PUT",
        body: JSON.stringify({
          ...data.ldap,
          bind_password: ldapPass || undefined,
        }),
      });
      setMsg(res.message);
      setLdapPass("");
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  async function syncLdap() {
    try {
      const res = await api<{ message: string; created?: number; updated?: number }>(
        "/settings/integrations/ldap/sync-groups",
        { method: "POST", body: JSON.stringify({ dry_run: false }) },
      );
      setMsg(`${res.message} (created=${res.created ?? 0}, updated=${res.updated ?? 0})`);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка sync");
    }
  }

  async function saveSso(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    try {
      const res = await api<{ message: string }>("/settings/integrations/sso", {
        method: "PUT",
        body: JSON.stringify({ ...data.sso, client_secret: ssoSecret || undefined }),
      });
      setMsg(res.message);
      setSsoSecret("");
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  if (!data) return <div className="text-sm text-muted">Загрузка…</div>;

  return (
    <div className="space-y-4" data-testid="settings-integrations">
      {err && <Card className="border-danger/40 text-sm text-danger">{err}</Card>}
      {msg && <Card className="text-sm text-ok">{msg}</Card>}

      <Card>
        <h2 className="mb-3 font-display text-lg font-semibold">SMTP / Exchange</h2>
        <form onSubmit={saveSmtp} className="grid gap-3 md:grid-cols-2">
          <Input label="Host" value={data.smtp.host} onChange={(e) => setData({ ...data, smtp: { ...data.smtp, host: e.target.value } })} />
          <Input label="Port" type="number" value={String(data.smtp.port)} onChange={(e) => setData({ ...data, smtp: { ...data.smtp, port: Number(e.target.value) } })} />
          <Input label="From" value={data.smtp.from_addr} onChange={(e) => setData({ ...data, smtp: { ...data.smtp, from_addr: e.target.value } })} />
          <Input label="Username" value={data.smtp.username} onChange={(e) => setData({ ...data, smtp: { ...data.smtp, username: e.target.value } })} />
          <Input label={`Password ${data.smtp.password_masked ? `(${data.smtp.password_masked})` : ""}`} type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} />
          <label className="flex items-center gap-2 text-sm self-end pb-2">
            <input type="checkbox" checked={data.smtp.use_tls} onChange={(e) => setData({ ...data, smtp: { ...data.smtp, use_tls: e.target.checked } })} />
            STARTTLS
          </label>
          <div className="md:col-span-2 flex flex-wrap gap-2">
            <Button type="submit">Сохранить SMTP</Button>
            <Input label="Test to" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            <Button type="button" variant="secondary" onClick={testSmtp}>
              Test send
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-semibold">LDAP / Active Directory</h2>
          <Badge tone={data.ldap.mock_mode ? "warn" : "neutral"}>
            {data.ldap.mock_mode ? "mock" : "live TCP"}
          </Badge>
        </div>
        <p className="mb-3 text-xs text-muted">
          {data.ldap.mock_mode
            ? "Сейчас demo-группы без реального каталога. Снимите Mock mode для TCP-проверки bind."
            : "Live bind/search по TCP. Полный AD provisioning — staging."}
        </p>
        <form onSubmit={saveLdap} className="grid gap-3 md:grid-cols-2">
          <Input label="Host" value={data.ldap.host} onChange={(e) => setData({ ...data, ldap: { ...data.ldap, host: e.target.value } })} />
          <Input label="Port" type="number" value={String(data.ldap.port)} onChange={(e) => setData({ ...data, ldap: { ...data.ldap, port: Number(e.target.value) } })} />
          <Input label="Bind DN" value={data.ldap.bind_dn} onChange={(e) => setData({ ...data, ldap: { ...data.ldap, bind_dn: e.target.value } })} />
          <Input label="Bind password" type="password" value={ldapPass} onChange={(e) => setLdapPass(e.target.value)} />
          <Input label="Base DN" value={data.ldap.base_dn} onChange={(e) => setData({ ...data, ldap: { ...data.ldap, base_dn: e.target.value } })} />
          <Input label="Group filter" value={data.ldap.group_filter} onChange={(e) => setData({ ...data, ldap: { ...data.ldap, group_filter: e.target.value } })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={data.ldap.mock_mode} onChange={(e) => setData({ ...data, ldap: { ...data.ldap, mock_mode: e.target.checked } })} />
            Mock mode (demo groups)
          </label>
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit">Сохранить LDAP</Button>
            <Button type="button" variant="secondary" onClick={syncLdap}>
              Sync groups
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-semibold">SSO (OIDC/SAML)</h2>
          <Badge tone={data.sso.staging || !data.sso.enabled ? "warn" : "neutral"}>
            {data.sso.enabled ? (data.sso.staging ? "staging" : "config") : "disabled"}
          </Badge>
        </div>
        <p className="mb-3 text-xs text-muted">
          Сохранение конфигурации доступно; полноценный OIDC login flow — в roadmap (не live).
        </p>
        <form onSubmit={saveSso} className="grid gap-3 md:grid-cols-2">
          <Input label="Provider" value={data.sso.provider} onChange={(e) => setData({ ...data, sso: { ...data.sso, provider: e.target.value } })} />
          <Input label="Client ID" value={data.sso.client_id} onChange={(e) => setData({ ...data, sso: { ...data.sso, client_id: e.target.value } })} />
          <Input label="Client secret" type="password" value={ssoSecret} onChange={(e) => setSsoSecret(e.target.value)} />
          <Input label="Issuer URL" value={data.sso.issuer_url} onChange={(e) => setData({ ...data, sso: { ...data.sso, issuer_url: e.target.value } })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={data.sso.enabled} onChange={(e) => setData({ ...data, sso: { ...data.sso, enabled: e.target.checked } })} />
            Enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={data.sso.staging} onChange={(e) => setData({ ...data, sso: { ...data.sso, staging: e.target.checked } })} />
            Staging flag
          </label>
          <div className="md:col-span-2">
            <Button type="submit">Сохранить SSO</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
