"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatDate, severityTone } from "@/lib/severity";

type Detail = {
  id: number;
  title: string;
  description: string;
  severity: string;
  status: string;
  linked_cve_id?: string | null;
  linked_bdu_id?: string | null;
  assignee_user_id?: number | null;
  assignee_name?: string;
  group_id?: number | null;
  group_name?: string;
  created_by_name?: string;
  due_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  comments: { id: number; author_name: string; body: string; created_at?: string | null }[];
  events: { id: number; actor_name: string; event_type: string; message: string; created_at?: string | null }[];
};

type GroupOpt = { id: number; name: string; source: string };

const NEXT: Record<string, string[]> = {
  new: ["in_progress", "waiting", "closed"],
  in_progress: ["waiting", "resolved", "closed"],
  waiting: ["in_progress", "resolved", "closed"],
  resolved: ["closed", "in_progress"],
  closed: ["in_progress"],
};

export default function TicketDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { user } = useAuth();
  const [data, setData] = useState<Detail | null>(null);
  const [groups, setGroups] = useState<GroupOpt[]>([]);
  const [comment, setComment] = useState("");
  const [groupId, setGroupId] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const canManage = !!user && (user.is_super_admin || user.roles.includes("ticket_manager") || user.roles.includes("admin"));

  const load = useCallback(async () => {
    const d = await api<Detail>(`/tickets/${id}`);
    setData(d);
    setGroupId(d.group_id ? String(d.group_id) : "");
  }, [id]);

  useEffect(() => {
    if (!id) return;
    load().catch((e) => setErr(e.message));
    api<GroupOpt[]>("/tickets/meta/groups")
      .then(setGroups)
      .catch(() => undefined);
  }, [id, load]);

  async function setStatus(status: string) {
    setErr(null);
    try {
      await api(`/tickets/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      setMsg(`Статус → ${status}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }

  async function assign(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/tickets/${id}/assign`, {
        method: "POST",
        body: JSON.stringify({
          assignee_user_id: user?.id,
          group_id: groupId ? Number(groupId) : 0,
        }),
      });
      setMsg("Назначение обновлено");
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  async function sendComment(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/tickets/${id}/comments`, { method: "POST", body: JSON.stringify({ body: comment }) });
      setComment("");
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  if (!data) return <div className="text-sm text-muted">Загрузка заявки…</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-5" data-testid="ticket-detail">
      {err && <Card className="border-danger/40 text-sm text-danger">{err}</Card>}
      {msg && <Card className="text-sm text-ok">{msg}</Card>}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Ticket #{data.id}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{data.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{data.status}</Badge>
            <Badge tone={severityTone(data.severity)}>{data.severity}</Badge>
            {data.linked_cve_id && (
              <Link href={`/vuln/${encodeURIComponent(data.linked_cve_id)}`} className="text-accent2 hover:underline">
                {data.linked_cve_id}
              </Link>
            )}
            {data.linked_bdu_id && (
              <Link href={`/bdu/${encodeURIComponent(data.linked_bdu_id)}`} className="text-accent2 hover:underline">
                {data.linked_bdu_id}
              </Link>
            )}
          </div>
        </div>
        <Link href="/tickets" className="text-sm text-accent2 hover:underline">
          ← К списку
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 text-sm">
        <Card className="p-4">
          <div className="text-muted">Assignee</div>
          <div className="mt-1">{data.assignee_name || "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-muted">Group queue</div>
          <div className="mt-1">{data.group_name || "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-muted">Updated</div>
          <div className="mt-1">{formatDate(data.updated_at)}</div>
        </Card>
      </div>

      <Card>
        <h2 className="font-display text-lg font-semibold">Описание</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{data.description || "—"}</p>
      </Card>

      <Card>
        <h2 className="mb-3 font-display text-lg font-semibold">Статус</h2>
        <div className="flex flex-wrap gap-2">
          {(NEXT[data.status] || []).map((s) => (
            <Button key={s} type="button" variant="secondary" onClick={() => setStatus(s)}>
              → {s}
            </Button>
          ))}
        </div>
      </Card>

      {canManage && (
        <Card>
          <h2 className="mb-3 font-display text-lg font-semibold">Назначение</h2>
          <form onSubmit={assign} className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Группа</span>
              <select
                className="rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                <option value="">—</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.source})
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit">Назначить себе + группу</Button>
          </form>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 font-display text-lg font-semibold">Комментарии</h2>
        <ul className="mb-4 space-y-2">
          {data.comments.map((c) => (
            <li key={c.id} className="rounded-xl border border-border px-3 py-2 text-sm">
              <div className="text-xs text-muted">
                {c.author_name || "user"} · {formatDate(c.created_at)}
              </div>
              <div className="mt-1 whitespace-pre-wrap">{c.body}</div>
            </li>
          ))}
          {!data.comments.length && <li className="text-sm text-muted">Пока нет комментариев.</li>}
        </ul>
        <form onSubmit={sendComment} className="space-y-2">
          <textarea
            className="min-h-[80px] w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий…"
            required
          />
          <Button type="submit">Отправить</Button>
        </form>
      </Card>

      <Card data-testid="ticket-timeline">
        <h2 className="mb-3 font-display text-lg font-semibold">Timeline</h2>
        <ul className="space-y-2 text-sm">
          {data.events.map((e) => (
            <li key={e.id} className="border-l-2 border-accent/40 pl-3">
              <div className="text-xs text-muted">
                {formatDate(e.created_at)} · {e.actor_name || "system"} · {e.event_type}
              </div>
              <div>{e.message}</div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
