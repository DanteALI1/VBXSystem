"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
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
  updated_at?: string | null;
};

type ListOut = { total: number; page: number; page_size: number; results: Ticket[] };

const STATUSES = ["", "new", "in_progress", "waiting", "resolved", "closed"];

export default function TicketsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const preCve = params.get("cve") || "";
  const preBdu = params.get("bdu") || "";

  const canWrite =
    !!user &&
    (user.is_super_admin || user.roles.some((r) => ["admin", "analyst", "ticket_manager"].includes(r)));

  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [vuln, setVuln] = useState(preCve || preBdu || "");
  const [data, setData] = useState<ListOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(!!(preCve || preBdu));
  const [title, setTitle] = useState(preCve ? `Обработка ${preCve}` : preBdu ? `Обработка ${preBdu}` : "");
  const [description, setDescription] = useState("");
  const [createSeverity, setCreateSeverity] = useState("HIGH");
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const q = new URLSearchParams();
      if (status) q.set("status", status);
      if (severity) q.set("severity", severity);
      if (vuln.trim()) q.set("vuln", vuln.trim());
      const res = await api<ListOut>(`/tickets?${q.toString()}`);
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }, [status, severity, vuln]);

  useEffect(() => {
    load();
  }, [load]);

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
        closed: "neutral" as const,
      }),
    [],
  );

  return (
    <div className="space-y-6" data-testid="tickets-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Заявки</h1>
          <p className="mt-1 text-sm text-muted">Очередь обработки уязвимостей.</p>
        </div>
        {canWrite && (
          <Button type="button" onClick={() => setShowCreate(true)}>
            <Plus size={14} />
            Создать
          </Button>
        )}
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
                className="min-h-[90px] w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">Severity</span>
              <select
                className="w-full rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm"
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
            <Input label="CVE / BDU" value={vuln} onChange={(e) => setVuln(e.target.value)} placeholder="CVE-2024-0001" />
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

      <Card>
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Status</span>
            <select
              className="w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s || "all"} value={s}>
                  {s || "Все"}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Severity</span>
            <select
              className="w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              {["", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => (
                <option key={s || "all"} value={s}>
                  {s || "Любая"}
                </option>
              ))}
            </select>
          </label>
          <Input label="Vuln" value={vuln} onChange={(e) => setVuln(e.target.value)} placeholder="CVE / BDU" />
          <div className="flex items-end">
            <Button type="button" variant="secondary" onClick={load}>
              Применить
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto" data-testid="tickets-table">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="pb-2">ID</th>
                <th className="pb-2">Title</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Severity</th>
                <th className="pb-2">Vuln</th>
                <th className="pb-2">Assignee</th>
                <th className="pb-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {(data?.results || []).map((t) => (
                <tr key={t.id} className="border-t border-border" data-testid={`ticket-row-${t.id}`}>
                  <td className="py-2">
                    <Link href={`/tickets/${t.id}`} className="text-accent2 hover:underline">
                      #{t.id}
                    </Link>
                  </td>
                  <td className="py-2">{t.title}</td>
                  <td className="py-2">
                    <Badge tone={statusTone[t.status as keyof typeof statusTone] || "neutral"}>{t.status}</Badge>
                  </td>
                  <td className="py-2">
                    <Badge tone={severityTone(t.severity)}>{t.severity}</Badge>
                  </td>
                  <td className="py-2 font-mono text-xs">{t.linked_cve_id || t.linked_bdu_id || "—"}</td>
                  <td className="py-2 text-muted">{t.assignee_name || t.group_name || "—"}</td>
                  <td className="py-2 text-xs text-muted">{formatDate(t.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.results.length === 0 && <p className="py-6 text-sm text-muted">Заявок нет.</p>}
        </div>
      </Card>
    </div>
  );
}
