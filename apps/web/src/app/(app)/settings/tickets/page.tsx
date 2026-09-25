"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { api, hasPermission } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type RuleWhen = {
  severity_gte?: string | null;
  is_kev?: boolean | null;
  cve_match?: string | null;
};

type AutoRule = {
  when: RuleWhen | string;
  action: string;
  enabled: boolean;
};

type EditorRow = {
  key: string;
  kind: "severity_gte" | "is_kev" | "cve_match";
  severity_gte: string;
  cve_match: string;
  enabled: boolean;
};

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

function newKey() {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toEditor(rules: AutoRule[]): EditorRow[] {
  return (rules || []).map((r) => {
    const when = typeof r.when === "string" ? parseWhenString(r.when) : r.when || {};
    let kind: EditorRow["kind"] = "severity_gte";
    if (when.is_kev) kind = "is_kev";
    else if (when.cve_match) kind = "cve_match";
    else kind = "severity_gte";
    return {
      key: newKey(),
      kind,
      severity_gte: (when.severity_gte || "HIGH").toUpperCase(),
      cve_match: (when.cve_match || "").toUpperCase(),
      enabled: r.enabled !== false,
    };
  });
}

function parseWhenString(s: string): RuleWhen {
  const t = s.trim();
  const sev = t.match(/^severity\s*>=\s*(CRITICAL|HIGH|MEDIUM|LOW|INFO)$/i);
  if (sev) return { severity_gte: sev[1].toUpperCase() };
  if (/^is_kev$/i.test(t)) return { is_kev: true };
  const cve = t.match(/^cve_match\s*:\s*(CVE-\d{4}-\d+)$/i);
  if (cve) return { cve_match: cve[1].toUpperCase() };
  if (/^CVE-\d{4}-\d+$/i.test(t)) return { cve_match: t.toUpperCase() };
  return {};
}

function toPayload(rows: EditorRow[]): AutoRule[] {
  return rows
    .map((r) => {
      const when: RuleWhen = {};
      if (r.kind === "severity_gte") when.severity_gte = r.severity_gte || "HIGH";
      else if (r.kind === "is_kev") when.is_kev = true;
      else if (r.kind === "cve_match") when.cve_match = (r.cve_match || "").toUpperCase().trim();
      return {
        when,
        action: "create_ticket",
        enabled: r.enabled,
      };
    })
    .filter((r) => {
      const w = r.when as RuleWhen;
      return !!(w.severity_gte || w.is_kev || w.cve_match);
    });
}

function kindLabel(kind: EditorRow["kind"]) {
  if (kind === "severity_gte") return "Критичность ≥";
  if (kind === "is_kev") return "В каталоге KEV";
  return "Совпадение CVE";
}

export default function TicketAutoRulesSettingsPage() {
  const { user, loading } = useAuth();
  const canRead = hasPermission(user, "settings:read") || hasPermission(user, "tickets:manage");
  const canWrite = hasPermission(user, "settings:write") || hasPermission(user, "tickets:manage");

  const [rows, setRows] = useState<EditorRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const data = await api<{ rules: AutoRule[] }>("/settings/ticket-auto-rules");
      setRows(toEditor(data.rules || []));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load]);

  function addRow() {
    setRows((prev) => [
      ...prev,
      { key: newKey(), kind: "severity_gte", severity_gte: "HIGH", cve_match: "", enabled: true },
    ]);
  }

  function updateRow(key: string, patch: Partial<EditorRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const data = await api<{ rules: AutoRule[] }>("/settings/ticket-auto-rules", {
        method: "PUT",
        body: JSON.stringify({ rules: toPayload(rows) }),
      });
      setRows(toEditor(data.rules || []));
      setMsg("Правила сохранены");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="text-sm text-muted">Загрузка…</div>;
  if (!canRead) {
    return <Card>Нет права settings:read. Обратитесь к администратору.</Card>;
  }

  return (
    <div className="space-y-4" data-testid="ticket-auto-rules-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Авто-заявки</h2>
          <p className="mt-1 text-sm text-muted">
            После ingest находок (или promote) совпавшее правило создаёт не более одной заявки на
            находку. Без спама: повторный матч не дублирует ticket_id.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={load} disabled={busy}>
            <RefreshCw size={14} />
            Обновить
          </Button>
          {canWrite && (
            <Button type="button" variant="secondary" onClick={addRow} disabled={busy}>
              <Plus size={14} />
              Правило
            </Button>
          )}
        </div>
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

      <form onSubmit={onSave} className="space-y-3">
        {rows.length === 0 ? (
          <Card className="text-sm text-muted">
            Правил нет. Добавьте условие по критичности, KEV или конкретному CVE.
          </Card>
        ) : (
          rows.map((r, idx) => (
            <Card key={r.key} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">#{idx + 1}</Badge>
                  <span className="text-sm text-muted">{kindLabel(r.kind)}</span>
                  {!r.enabled && <Badge tone="neutral">выкл</Badge>}
                </div>
                {canWrite && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => removeRow(r.key)}
                    disabled={busy}
                  >
                    <Trash2 size={14} />
                    Удалить
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block space-y-1.5">
                  <span className="text-sm text-muted">Тип условия</span>
                  <select
                    className="rounded-xl border border-border bg-surface2 px-3 py-2 text-sm"
                    value={r.kind}
                    disabled={!canWrite || busy}
                    onChange={(e) =>
                      updateRow(r.key, { kind: e.target.value as EditorRow["kind"] })
                    }
                  >
                    <option value="severity_gte">severity ≥</option>
                    <option value="is_kev">is_kev</option>
                    <option value="cve_match">cve_match</option>
                  </select>
                </label>
                {r.kind === "severity_gte" && (
                  <label className="block space-y-1.5">
                    <span className="text-sm text-muted">Минимальная критичность</span>
                    <select
                      className="rounded-xl border border-border bg-surface2 px-3 py-2 text-sm"
                      value={r.severity_gte}
                      disabled={!canWrite || busy}
                      onChange={(e) => updateRow(r.key, { severity_gte: e.target.value })}
                    >
                      {SEVERITIES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {r.kind === "cve_match" && (
                  <div className="min-w-[220px] flex-1">
                    <Input
                      label="CVE"
                      value={r.cve_match}
                      disabled={!canWrite || busy}
                      onChange={(e) => updateRow(r.key, { cve_match: e.target.value })}
                      placeholder="CVE-2021-44228"
                    />
                  </div>
                )}
                {r.kind === "is_kev" && (
                  <p className="pb-2 text-sm text-muted">
                    Сработает, если хотя бы один linked CVE есть в CISA KEV.
                  </p>
                )}
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    disabled={!canWrite || busy}
                    onChange={(e) => updateRow(r.key, { enabled: e.target.checked })}
                  />
                  Включено
                </label>
              </div>
              <p className="text-xs text-muted">Действие: create_ticket</p>
            </Card>
          ))
        )}

        {canWrite && (
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              <Save size={14} />
              Сохранить
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
