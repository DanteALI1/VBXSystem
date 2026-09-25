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
    userinfo_url: string;
    redirect_uri: string;
    scopes: string;
    staging: boolean;
    button_label: string;
    role_map: Record<string, string>;
  };
  telegram: {
    enabled: boolean;
    bot_token_masked: string;
    bot_token_configured: boolean;
    chat_id: string;
  };
};

export default function IntegrationsPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<Integrations | null>(null);
  const [smtpPass, setSmtpPass] = useState("");
  const [ldapPass, setLdapPass] = useState("");
  const [ssoSecret, setSsoSecret] = useState("");
  const [tgToken, setTgToken] = useState("");
  const [roleMapText, setRoleMapText] = useState("{}");
  const [testTo, setTestTo] = useState("admin@example.local");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const res = await api<Integrations>("/settings/integrations");
    setData(res);
    setRoleMapText(JSON.stringify(res.sso.role_map || {}, null, 2));
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
      let role_map: Record<string, string> = {};
      try {
        role_map = JSON.parse(roleMapText || "{}");
      } catch {
        throw new Error("role_map: невалидный JSON");
      }
      const res = await api<{ message: string }>("/settings/integrations/sso", {
        method: "PUT",
        body: JSON.stringify({
          ...data.sso,
          role_map,
          client_secret: ssoSecret || undefined,
        }),
      });
      setMsg(res.message);
      setSsoSecret("");
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  async function testSso() {
    try {
      const res = await api<{ message: string }>("/settings/integrations/sso/test", {
        method: "POST",
        body: "{}",
      });
      setMsg(res.message);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка SSO");
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
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={data.smtp.use_tls} onChange={(e) => setData({ ...data, smtp: { ...data.smtp, use_tls: e.target.checked } })} />
            STARTTLS
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-2">
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
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit">Сохранить LDAP</Button>
            <Button type="button" variant="secondary" onClick={syncLdap}>
              Sync groups
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-semibold">SSO (OIDC)</h2>
          <Badge tone={data.sso.staging || !data.sso.enabled ? "warn" : "ok"}>
            {data.sso.enabled ? (data.sso.staging ? "staging" : "live") : "disabled"}
          </Badge>
        </div>
        <p className="mb-3 text-xs text-muted">
          Staging: кнопка на /login входит без IdP (demo-пользователь). Live: Authorization Code +
          auto-provision. Redirect URI для IdP:{" "}
          <code className="text-accent2">{data.sso.redirect_uri}</code>
        </p>
        <form onSubmit={saveSso} className="grid gap-3 md:grid-cols-2">
          <Input
            label="Кнопка на login"
            value={data.sso.button_label}
            onChange={(e) => setData({ ...data, sso: { ...data.sso, button_label: e.target.value } })}
          />
          <Input
            label="Provider"
            value={data.sso.provider}
            onChange={(e) => setData({ ...data, sso: { ...data.sso, provider: e.target.value } })}
          />
          <Input
            label="Client ID"
            value={data.sso.client_id}
            onChange={(e) => setData({ ...data, sso: { ...data.sso, client_id: e.target.value } })}
          />
          <Input
            label="Client secret"
            type="password"
            value={ssoSecret}
            onChange={(e) => setSsoSecret(e.target.value)}
          />
          <Input
            label="Issuer URL"
            value={data.sso.issuer_url}
            onChange={(e) => setData({ ...data, sso: { ...data.sso, issuer_url: e.target.value } })}
          />
          <Input
            label="Scopes"
            value={data.sso.scopes}
            onChange={(e) => setData({ ...data, sso: { ...data.sso, scopes: e.target.value } })}
          />
          <Input
            label="Authorize URL (опц.)"
            value={data.sso.authorize_url}
            onChange={(e) => setData({ ...data, sso: { ...data.sso, authorize_url: e.target.value } })}
          />
          <Input
            label="Token URL (опц.)"
            value={data.sso.token_url}
            onChange={(e) => setData({ ...data, sso: { ...data.sso, token_url: e.target.value } })}
          />
          <Input
            label="Redirect URI"
            value={data.sso.redirect_uri}
            onChange={(e) => setData({ ...data, sso: { ...data.sso, redirect_uri: e.target.value } })}
          />
          <label className="md:col-span-2 block text-sm">
            <span className="mb-1 block text-muted">Claims → roles (JSON)</span>
            <textarea
              className="vbx-field min-h-[88px] font-mono text-xs"
              value={roleMapText}
              onChange={(e) => setRoleMapText(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={data.sso.enabled}
              onChange={(e) => setData({ ...data, sso: { ...data.sso, enabled: e.target.checked } })}
            />
            Enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={data.sso.staging}
              onChange={(e) => setData({ ...data, sso: { ...data.sso, staging: e.target.checked } })}
            />
            Staging (без IdP)
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit">Сохранить SSO</Button>
            <Button type="button" variant="secondary" onClick={testSso}>
              Проверить конфиг
            </Button>
            {data.sso.enabled ? (
              <a
                href="/api/auth/sso/login?next=/dashboard"
                className="inline-flex items-center rounded-xl border border-border px-4 py-2 text-sm hover:border-accent/40"
              >
                Тест входа
              </a>
            ) : null}
          </div>
        </form>
      </Card>

      <Card data-testid="integrations-telegram">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-semibold">Telegram</h2>
          <Badge tone={data.telegram?.enabled ? "ok" : "neutral"}>
            {data.telegram?.enabled ? "enabled" : "off"}
          </Badge>
          <Badge tone="warn">stub</Badge>
        </div>
        <p className="mb-3 text-xs text-muted">
          Bot token + chat_id. Тест пишет в лог API; без токена — no-op (live Bot API позже).
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!data) return;
            try {
              const res = await api<{ message: string }>("/settings/integrations/telegram", {
                method: "PUT",
                body: JSON.stringify({
                  enabled: data.telegram.enabled,
                  chat_id: data.telegram.chat_id,
                  bot_token: tgToken || undefined,
                }),
              });
              setMsg(res.message);
              setTgToken("");
              await load();
            } catch (ex) {
              setErr(ex instanceof Error ? ex.message : "Ошибка");
            }
          }}
          className="grid gap-3 md:grid-cols-2"
        >
          <Input
            label={`Bot token ${data.telegram?.bot_token_masked ? `(${data.telegram.bot_token_masked})` : ""}`}
            type="password"
            value={tgToken}
            onChange={(e) => setTgToken(e.target.value)}
          />
          <Input
            label="Chat ID"
            value={data.telegram?.chat_id || ""}
            onChange={(e) =>
              setData({
                ...data,
                telegram: { ...data.telegram, chat_id: e.target.value },
              })
            }
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!data.telegram?.enabled}
              onChange={(e) =>
                setData({
                  ...data,
                  telegram: { ...data.telegram, enabled: e.target.checked },
                })
              }
            />
            Enabled
          </label>
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit">Сохранить Telegram</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                try {
                  const res = await api<{ message: string }>("/settings/integrations/telegram/test", {
                    method: "POST",
                  });
                  setMsg(res.message);
                } catch (ex) {
                  setErr(ex instanceof Error ? ex.message : "Ошибка");
                }
              }}
            >
              Test (log/no-op)
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
