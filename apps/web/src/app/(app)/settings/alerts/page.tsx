"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, RotateCw, Trash2 } from "lucide-react";
import { api, hasPermission } from "@/lib/api";
import { buildQs } from "@/lib/queryString";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatDate } from "@/lib/severity";

type Tab = "policies" | "outbox" | "jira";

type AlertPolicy = {
  id: number;
  name: string;
  trigger: string;
  channels: string[];
  filters: { min_risk?: number; priority?: string; severity?: string };
  enabled: boolean;
  created_at?: string | null;
};

type OutboxRow = {
  id: number;
  channel: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  last_error: string;
  created_at?: string | null;
  sent_at?: string | null;
};

type JiraSettings = {
  base_url: string;
  email: string;
  api_token_configured?: boolean;
  project_key: string;
  issue_type: string;
  dry_run: boolean;
  api_token?: string;
};

const TRIGGERS = [
  { value: "finding_created", label: "finding_created" },
  { value: "scan_completed", label: "scan_completed" },
  { value: "scan_failed", label: "scan_failed" },
  { value: "watchlist", label: "watchlist" },
] as const;

const CHANNELS = ["webhook", "email", "telegram", "slack", "teams"] as const;

const TABS: { id: Tab; label: string }[] = [
  { id: "policies", label: "Политики" },
  { id: "outbox", label: "Outbox" },
  { id: "jira", label: "Jira" },
];

export default function AlertsConsolePage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, "settings:write");
  const [tab, setTab] = useState<Tab>("policies");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [policies, setPolicies] = useState<AlertPolicy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<string>("finding_created");
  const [channels, setChannels] = useState<string[]>(["webhook"]);
  const [minRisk, setMinRisk] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const [outbox, setOutbox] = useState<OutboxRow[]>([]);
  const [outboxStatus, setOutboxStatus] = useState("");
  const [outboxLoading, setOutboxLoading] = useState(false);
  const [retryId, setRetryId] = useState<number | null>(null);

  const [jira, setJira] = useState<JiraSettings | null>(null);
  const [jiraBusy, setJiraBusy] = useState(false);

  const loadPolicies = useCallback(async () => {
    setPoliciesLoading(true);
    setErr(null);
    try {
      const data = await api<AlertPolicy[]>("/alert-policies");
      setPolicies(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка политик");
      setPolicies([]);
    } finally {
      setPoliciesLoading(false);
    }
  }, []);

  const loadOutbox = useCallback(async () => {
    setOutboxLoading(true);
    setErr(null);
    try {
      const qs = buildQs({ status: outboxStatus || undefined });
      const data = await api<OutboxRow[]>(`/alerts/outbox${qs ? `?${qs}` : ""}`);
      setOutbox(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка outbox");
      setOutbox([]);
    } finally {
      setOutboxLoading(false);
    }
  }, [outboxStatus]);

  const loadJira = useCallback(async () => {
    setErr(null);
    try {
      const data = await api<JiraSettings>("/settings/jira");
      setJira({ ...data, api_token: "" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка Jira");
      setJira(null);
    }
  }, []);

  useEffect(() => {
    if (!canWrite) return;
    if (tab === "policies") void loadPolicies();
    if (tab === "outbox") void loadOutbox();
    if (tab === "jira") void loadJira();
  }, [canWrite, tab, loadPolicies, loadOutbox, loadJira]);

  function toggleChannel(ch: string) {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    );
  }

  async function createPolicy(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !channels.length) return;
    setSavingPolicy(true);
    setErr(null);
    setMsg(null);
    try {
      const filters: Record<string, unknown> = {};
      if (minRisk.trim()) {
        const n = Number(minRisk);
        if (Number.isFinite(n)) filters.min_risk = n;
      }
      await api("/alert-policies", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          trigger,
          channels,
          filters,
          enabled,
        }),
      });
      setMsg("Политика создана");
      setName("");
      setMinRisk("");
      setChannels(["webhook"]);
      setEnabled(true);
      await loadPolicies();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка создания");
    } finally {
      setSavingPolicy(false);
    }
  }

  async function deletePolicy(id: number) {
    if (!window.confirm("Удалить политику?")) return;
    setErr(null);
    setMsg(null);
    try {
      await api(`/alert-policies/${id}`, { method: "DELETE" });
      setMsg("Политика удалена");
      await loadPolicies();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка удаления");
    }
  }

  async function retryOutbox(id: number) {
    setRetryId(id);
    setErr(null);
    setMsg(null);
    try {
      await api(`/alerts/outbox/${id}/retry`, { method: "POST" });
      setMsg(`Повтор #${id} поставлен в очередь`);
      await loadOutbox();
    } catch (e) {
      // endpoint may not exist — keep list usable
      setErr(e instanceof Error ? e.message : "Retry недоступен");
    } finally {
      setRetryId(null);
    }
  }

  async function saveJira(e: FormEvent) {
    e.preventDefault();
    if (!jira) return;
    setJiraBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        base_url: jira.base_url,
        email: jira.email,
        project_key: jira.project_key,
        issue_type: jira.issue_type,
        dry_run: jira.dry_run,
      };
      if (jira.api_token?.trim()) body.api_token = jira.api_token.trim();
      const res = await api<JiraSettings>("/settings/jira", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setJira({ ...res, api_token: "" });
      setMsg("Настройки Jira сохранены");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка сохранения");
    } finally {
      setJiraBusy(false);
    }
  }

  if (!canWrite) {
    return (
      <Card data-testid="settings-alerts">
        Нет права settings:write для консоли алертов.
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="settings-alerts">
      <div>
        <h2 className="font-display text-lg font-semibold">Консоль алертов</h2>
        <p className="mt-1 text-sm text-muted">
          Политики, исходящий outbox и интеграция Jira
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-xl px-3 py-2 text-sm ${
              tab === t.id
                ? "bg-accent/15 text-accent2"
                : "bg-surface2 text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {err && (
        <Card className="border-danger/40 text-sm text-danger" role="alert">
          {err}
        </Card>
      )}
      {msg && (
        <Card className="text-sm text-ok" role="status">
          {msg}
        </Card>
      )}

      {tab === "policies" && (
        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="text-sm font-medium">Новая политика</div>
            <form onSubmit={createPolicy} className="grid gap-3 md:grid-cols-2">
              <Input
                label="Название"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <label className="block space-y-1.5">
                <span className="text-sm text-muted">Триггер</span>
                <select
                  className="vbx-field"
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                >
                  {TRIGGERS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="space-y-1.5 md:col-span-2">
                <span className="text-sm text-muted">Каналы</span>
                <div className="flex flex-wrap gap-3">
                  {CHANNELS.map((ch) => (
                    <label key={ch} className="inline-flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={channels.includes(ch)}
                        onChange={() => toggleChannel(ch)}
                      />
                      {ch}
                    </label>
                  ))}
                </div>
              </div>
              <Input
                label="min_risk (опц.)"
                value={minRisk}
                onChange={(e) => setMinRisk(e.target.value)}
                placeholder="например 50"
                inputMode="numeric"
              />
              <label className="inline-flex items-center gap-2 self-end text-sm pb-2">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                Включена
              </label>
              <div className="md:col-span-2">
                <Button type="submit" disabled={savingPolicy}>
                  <Plus size={14} />
                  {savingPolicy ? "…" : "Создать"}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="overflow-x-auto p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-medium">Политики</span>
              <Button
                type="button"
                variant="ghost"
                disabled={policiesLoading}
                onClick={loadPolicies}
              >
                <RefreshCw size={14} />
              </Button>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-4 py-2">Имя</th>
                  <th className="px-4 py-2">Триггер</th>
                  <th className="px-4 py-2">Каналы</th>
                  <th className="px-4 py-2">Фильтры</th>
                  <th className="px-4 py-2">Статус</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id} className="border-b border-border/70">
                    <td className="px-4 py-2">{p.name}</td>
                    <td className="px-4 py-2 font-mono text-xs">{p.trigger}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(p.channels || []).map((c) => (
                          <Badge key={c}>{c}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted">
                      {p.filters?.min_risk != null
                        ? `min_risk ≥ ${p.filters.min_risk}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={p.enabled ? "ok" : "neutral"}>
                        {p.enabled ? "on" : "off"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => deletePolicy(p.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {policiesLoading && <p className="p-4 text-sm text-muted">Загрузка…</p>}
            {!policiesLoading && !policies.length && (
              <p className="p-4 text-sm text-muted">Нет политик</p>
            )}
          </Card>
        </div>
      )}

      {tab === "outbox" && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block space-y-1.5">
              <span className="text-sm text-muted">Статус</span>
              <select
                className="vbx-field"
                value={outboxStatus}
                onChange={(e) => setOutboxStatus(e.target.value)}
              >
                <option value="">Все</option>
                <option value="pending">pending</option>
                <option value="sent">sent</option>
                <option value="failed">failed</option>
              </select>
            </label>
            <Button type="button" variant="secondary" onClick={loadOutbox} disabled={outboxLoading}>
              <RefreshCw size={14} />
              Обновить
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-2 py-2">ID</th>
                  <th className="px-2 py-2">Канал</th>
                  <th className="px-2 py-2">Статус</th>
                  <th className="px-2 py-2">Попытки</th>
                  <th className="px-2 py-2">Ошибка</th>
                  <th className="px-2 py-2">Создано</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {outbox.map((r) => (
                  <tr key={r.id} className="border-b border-border/70">
                    <td className="px-2 py-2 font-mono text-xs">{r.id}</td>
                    <td className="px-2 py-2">{r.channel}</td>
                    <td className="px-2 py-2">
                      <Badge
                        tone={
                          r.status === "sent"
                            ? "ok"
                            : r.status === "failed"
                              ? "danger"
                              : "warn"
                        }
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-2">{r.attempts}</td>
                    <td className="max-w-xs truncate px-2 py-2 text-xs text-muted">
                      {r.last_error || "—"}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="px-2 py-2">
                      {(r.status === "failed" || r.status === "pending") && (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={retryId === r.id}
                          onClick={() => retryOutbox(r.id)}
                          title="Повторить"
                        >
                          <RotateCw size={14} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {outboxLoading && <p className="py-3 text-sm text-muted">Загрузка…</p>}
            {!outboxLoading && !outbox.length && (
              <p className="py-3 text-sm text-muted">Outbox пуст</p>
            )}
          </div>
        </Card>
      )}

      {tab === "jira" && (
        <Card className="space-y-4">
          {!jira ? (
            <p className="text-sm text-muted">Загрузка…</p>
          ) : (
            <form onSubmit={saveJira} className="grid gap-3 md:grid-cols-2">
              <Input
                label="Base URL"
                value={jira.base_url}
                onChange={(e) => setJira({ ...jira, base_url: e.target.value })}
                placeholder="https://jira.example.com"
              />
              <Input
                label="Email"
                value={jira.email}
                onChange={(e) => setJira({ ...jira, email: e.target.value })}
              />
              <Input
                label={
                  jira.api_token_configured
                    ? "API token (задан — оставьте пустым)"
                    : "API token"
                }
                type="password"
                value={jira.api_token || ""}
                onChange={(e) => setJira({ ...jira, api_token: e.target.value })}
                autoComplete="new-password"
              />
              <Input
                label="Project key"
                value={jira.project_key}
                onChange={(e) => setJira({ ...jira, project_key: e.target.value })}
                placeholder="SEC"
              />
              <Input
                label="Issue type"
                value={jira.issue_type}
                onChange={(e) => setJira({ ...jira, issue_type: e.target.value })}
              />
              <label className="inline-flex items-center gap-2 self-end pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={jira.dry_run}
                  onChange={(e) => setJira({ ...jira, dry_run: e.target.checked })}
                />
                Dry-run (без реальных тикетов)
              </label>
              <div className="md:col-span-2">
                <Button type="submit" disabled={jiraBusy}>
                  {jiraBusy ? "…" : "Сохранить Jira"}
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
