"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { FolderKanban, Plus, Trash2 } from "lucide-react";
import { api, hasPermission } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatDate } from "@/lib/severity";

type Project = {
  id: number;
  name: string;
  description?: string;
  org_unit_id?: number | null;
  created_by?: number | null;
  created_at?: string | null;
};

export default function ProjectsPage() {
  const { user } = useAuth();
  const canRead = hasPermission(user, "scan:read");
  const canWrite =
    hasPermission(user, "scan:run") || hasPermission(user, "settings:write");

  const [rows, setRows] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await api<Project[]>("/projects");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    void load();
  }, [canRead, load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canWrite || !name.trim()) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await api("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
        }),
      });
      setName("");
      setDescription("");
      setMsg("Проект создан");
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка создания");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: number) {
    if (!canWrite) return;
    if (!window.confirm("Удалить проект?")) return;
    setBusyId(id);
    setErr(null);
    setMsg(null);
    try {
      await api(`/projects/${id}`, { method: "DELETE" });
      setMsg("Проект удалён");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка удаления");
    } finally {
      setBusyId(null);
    }
  }

  if (!canRead) {
    return (
      <div className="space-y-4" data-testid="projects-page">
        <h1 className="font-display text-2xl font-semibold">Проекты</h1>
        <Card>Нет права scan:read.</Card>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="projects-page">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Проекты</h1>
        <p className="mt-1 text-sm text-muted">
          Группировка находок по проектам / кампаниям
        </p>
      </div>

      {canWrite ? (
        <Card className="space-y-3">
          <div className="text-sm font-medium">Новый проект</div>
          <form onSubmit={onCreate} className="grid gap-3 md:grid-cols-2">
            <Input
              label="Название"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Описание"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div>
              <Button type="submit" disabled={saving}>
                <Plus size={14} />
                {saving ? "…" : "Создать"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

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

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-muted">
            <tr>
              <th className="px-4 py-3">Проект</th>
              <th className="px-4 py-3">Описание</th>
              <th className="px-4 py-3">Создан</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-border/70">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-medium">
                    <FolderKanban size={14} className="text-muted" />
                    {p.name}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{p.description || "—"}</td>
                <td className="px-4 py-3 text-xs text-muted">
                  {formatDate(p.created_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/findings?project_id=${p.id}`}
                      className="text-sm text-accent2 hover:underline"
                    >
                      Находки
                    </Link>
                    {canWrite ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busyId === p.id}
                        onClick={() => onDelete(p.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <p className="p-4 text-sm text-muted">Загрузка…</p>}
        {!loading && !rows.length && (
          <p className="p-4 text-sm text-muted">Нет проектов</p>
        )}
      </Card>
    </div>
  );
}
