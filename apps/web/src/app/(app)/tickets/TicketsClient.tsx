"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { api, apiDownload } from "@/lib/api";
import { buildQs } from "@/lib/queryString";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  ChipFilter,
  ChipFilterBar,
  ChipFilterDef,
  chipsToParams,
} from "@/components/filters/ChipFilterBar";
import { formatDate, severityTone } from "@/lib/severity";

type Ticket = {
  id: number;
  title: string;
  severity: string;
  status: string;
  linked_cve_id?: string | null;
  linked_bdu_id?: string | null;
  assignee_name?: string;
  group_name?: string;
  due_at?: string | null;
  due_date?: string | null;
  sla_hours?: number | null;
  overdue?: boolean;
  updated_at?: string | null;
};

type ListOut = { total: number; page: number; page_size: number; results: Ticket[] };

const STATUS_LABEL: Record<string, string> = {
  new: "новая",
  in_progress: "в работе",
  waiting: "ожидание",
  resolved: "решена",
  pending_close: "на закрытие",
  closed: "закрыта",
};

const TICKET_DEFS: ChipFilterDef[] = [
  {
    field: "status",
    label: "Статус",
    type: "enum",
    ops: ["="],
    options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
  },
  {
    field: "severity",
    label: "Критичность",
    type: "enum",
    ops: ["="],
    options: ["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((v) => ({ value: v, label: v })),
  },
  {
    field: "overdue",
    label: "Просрочка",
    type: "enum",
    ops: ["="],
    options: [{ value: "1", label: "только просроченные" }],
  },
];

export default function TicketsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const preCve = params.get("cve") || "";
  const preBdu = params.get("bdu") || "";

  const canWrite =
    !!user &&
    (user.is_super_admin || user.roles.some((r) => ["admin", "analyst", "ticket_manager"].includes(r)));

  const [filters, setFilters] = useState<ChipFilter[]>([]);
  const [searchDraft, setSearchDraft] = useState(preCve || preBdu || "");
  const [vuln, setVuln] = useState(preCve || preBdu || "");
  const chipParams = chipsToParams(filters, ["status", "severity", "overdue"]);
  const [data, setData] = useState<ListOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(!!(preCve || preBdu));
  const [title, setTitle] = useState(preCve ? `Обработка ${preCve}` : preBdu ? `Обработка ${preBdu}` : "");
  const [description, setDescription] = useState("");
  const [createSeverity, setCreateSeverity] = useState("HIGH");
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);

  const filterQs = useCallback(
    (opts?: { limit?: number }) =>
      buildQs({
        status: chipParams.status,
        severity: chipParams.severity,
        vuln,
        overdue: chipParams.overdue === "1" || undefined,
        limit: opts?.limit,
      }),
    [chipParams.status, chipParams.severity, chipParams.overdue, vuln],
  );

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const qs = filterQs();
      const res = await api<ListOut>(`/tickets?${qs}`);
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filterQs]);

  useEffect(() => {
    load();
  }, [load]);

  async function onExport() {
    setExporting(true);
    setErr(null);
    try {
      const qs = filterQs({ limit: 2000 });
      await apiDownload(`/tickets/export?${qs}`, { filename: "tickets-export.csv" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setExporting(false);
    }
  }

  async function createTicket(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setWarning(null);
    setErr(null);
    try {
      const res = await api<{ ticket: Ticket; warning?: string | null }>("/tickets", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          severity: createSeverity,
          linked_cve_id: preCve || (vuln.toUpperCase().startsWith("CVE-") ? vuln : null),
          linked_bdu_id: preBdu || (vuln.toUpperCase().startsWith("BDU") ? vuln : null),
        }),
      });
      if (res.warning) setWarning(res.warning);
      setShowCreate(false);
      router.push(`/tickets/${res.ticket.id}`);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка создания");
    } finally {
      setBusy(false);
    }
  }

  const statusTone = useMemo(
    () =>
      ({
        new: "accent" as const,
        in_progress: "warn" as const,
        waiting: "neutral" as const,
        resolved: "ok" as const,
        pending_close: "warn" as const,
        closed: "neutral" as const,
      }),
    [],
  );

  const rows = data?.results || [];

  return (
    <div className="space-y-6" data-testid="tickets-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Заявки</h1>
          <p className="mt-1 text-sm text-muted">Очередь обработки уязвимостей.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={onExport} disabled={exporting || loading}>
            <Download size={14} />
            {exporting ? "…" : "CSV"}
          </Button>
          {canWrite && (
            <Button type="button" onClick={() => setShowCreate(true)}>
              <Plus size={14} />
              Создать
            </Button>
          )}
        </div>
      </div>

      {err && (
        <Card className="border-danger/40 text-sm text-danger" role="alert">
          {err}
        </Card>
      )}
      {warning && <Card className="border-warn/40 text-sm text-warn">{warning}</Card>}

      {showCreate && canWrite && (
        <Card data-testid="ticket-create-form">
          <h2 className="mb-3 font-display text-lg font-semibold">Новая заявка</h2>
          <form onSubmit={createTicket} className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Input label="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1.5 block text-muted">Описание</span>
              <textarea
                className="vbx-field min-h-[90px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">Критичность</span>
              <select
                className="vbx-field"
                value={createSeverity}
                onChange={(e) => setCreateSeverity(e.target.value)}
              >
                {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="CVE / БДУ"
              value={vuln}
              onChange={(e) => setVuln(e.target.value)}
              placeholder="CVE-2024-0001"
            />
            <div className="md:col-span-2 flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Создание…" : "Создать заявку"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                Отмена
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="rounded-lg border border-border bg-surface2/40 px-2 py-1.5">
        <ChipFilterBar
          defs={TICKET_DEFS}
          filters={filters}
          onChange={setFilters}
          search={searchDraft}
          onSearchChange={setSearchDraft}
          onSearchSubmit={(v) => setVuln(v.trim())}
          searchPlaceholder="CVE / БДУ…"
        />
      </div>

      <Card>
        <div className="mb-3 text-sm text-muted">
          Найдено: <span className="text-text">{data?.total ?? 0}</span>
          {loading ? " · загрузка…" : ""}
        </div>

        <div className="overflow-x-auto" data-testid="tickets-table">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="pb-2">ID</th>
                <th className="pb-2">Заголовок</th>
                <th className="pb-2">Статус</th>
                <th className="pb-2">Критичность</th>
                <th className="pb-2">SLA</th>
                <th className="pb-2">Уязвимость</th>
                <th className="pb-2">Исполнитель</th>
                <th className="pb-2">Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t border-border" data-testid={`ticket-row-${t.id}`}>
                  <td className="py-2">
                    <Link href={`/tickets/${t.id}`} className="text-accent2 hover:underline">
                      #{t.id}
                    </Link>
                  </td>
                  <td className="py-2">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {t.title}
                      {t.overdue && (
                        <Badge tone="danger" data-testid={`ticket-overdue-${t.id}`}>
                          просрочена
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="py-2">
                    <Badge tone={statusTone[t.status as keyof typeof statusTone] || "neutral"}>
                      {STATUS_LABEL[t.status] || t.status}
                    </Badge>
                  </td>
                  <td className="py-2">
                    <Badge tone={severityTone(t.severity)}>{t.severity}</Badge>
                  </td>
                  <td className="py-2 text-xs text-muted">
                    {t.sla_hours != null ? `${t.sla_hours}ч` : "—"}
                    {(t.due_at || t.due_date) && (
                      <span className="mt-0.5 block">{formatDate(t.due_at || t.due_date)}</span>
                    )}
                  </td>
                  <td className="py-2 font-mono text-xs">
                    {t.linked_cve_id ? (
                      <Link
                        href={`/vuln/${encodeURIComponent(t.linked_cve_id)}`}
                        className="text-accent2 hover:underline"
                      >
                        {t.linked_cve_id}
                      </Link>
                    ) : t.linked_bdu_id ? (
                      <Link
                        href={`/bdu/${encodeURIComponent(t.linked_bdu_id)}`}
                        className="text-accent2 hover:underline"
                      >
                        {t.linked_bdu_id}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 text-muted">{t.assignee_name || t.group_name || "—"}</td>
                  <td className="py-2 text-xs text-muted">{formatDate(t.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <p className="py-6 text-sm text-muted">Загрузка…</p>}
          {!loading && data && rows.length === 0 && (
            <p className="py-6 text-sm text-muted">
              Заявок по текущим фильтрам нет.
              {canWrite ? " Создайте первую или сбросьте фильтры." : ""}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
