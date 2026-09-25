"use client";

import { FormEvent, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api, User } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type Group = { id: number; name: string; source: string; description: string };
type Role = { code: string; name: string };

const selectClass =
  "vbx-field";

export default function UsersPage() {
  const { user, loading } = useAuth({ requireSuperAdmin: true });
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    username: "",
    email: "",
    password: "",
    full_name: "",
    role: "viewer",
    group_id: "",
  });
  const [groupName, setGroupName] = useState("");
  const [busyGroupId, setBusyGroupId] = useState<number | null>(null);
  const [adSyncMsg, setAdSyncMsg] = useState<string | null>(null);

  async function reload() {
    const [u, g, r] = await Promise.all([
      api<User[]>("/users"),
      api<Group[]>("/groups"),
      api<Role[]>("/users/meta/roles"),
    ]);
    setUsers(u);
    setGroups(g);
    setRoles(r);
    if (r.length && !r.some((x) => x.code === createForm.role)) {
      setCreateForm((f) => ({ ...f, role: r[0]?.code || "viewer" }));
    }
  }

  useEffect(() => {
    if (!user?.is_super_admin) return;
    reload().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading) return <div className="text-sm text-muted">Загрузка…</div>;
  if (!user?.is_super_admin) return null;

  async function approve(id: number) {
    await api(`/users/${id}/approve`, { method: "POST" });
    setMsg("Пользователь подтверждён");
    await reload();
  }

  async function reject(id: number) {
    await api(`/users/${id}/reject`, { method: "POST" });
    setMsg("Регистрация отклонена");
    await reload();
  }

  async function disable(id: number) {
    await api(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "disabled" }),
    });
    await reload();
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const group_ids = createForm.group_id ? [Number(createForm.group_id)] : [];
      await api("/users", {
        method: "POST",
        body: JSON.stringify({
          username: createForm.username,
          email: createForm.email,
          password: createForm.password,
          full_name: createForm.full_name,
          roles: [createForm.role || "viewer"],
          group_ids,
          status: "active",
        }),
      });
      setMsg("Пользователь создан");
      setCreateForm({
        username: "",
        email: "",
        password: "",
        full_name: "",
        role: roles[0]?.code || "viewer",
        group_id: "",
      });
      await reload();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  async function createGroup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!groupName.trim()) return;
    try {
      await api("/groups", {
        method: "POST",
        body: JSON.stringify({ name: groupName.trim(), source: "local", description: "" }),
      });
      setGroupName("");
      setMsg("Группа создана");
      await reload();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  async function deleteGroup(id: number, name: string) {
    if (!window.confirm(`Удалить группу «${name}»?`)) return;
    setError(null);
    setBusyGroupId(id);
    try {
      await api(`/groups/${id}`, { method: "DELETE" });
      setMsg(`Группа «${name}» удалена`);
      if (createForm.group_id === String(id)) {
        setCreateForm((f) => ({ ...f, group_id: "" }));
      }
      await reload();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Ошибка удаления");
    } finally {
      setBusyGroupId(null);
    }
  }

  async function syncAd() {
    const res = await api<{ message: string; status: string }>("/groups/ad/sync", {
      method: "POST",
      body: JSON.stringify({ dry_run: true }),
    });
    setAdSyncMsg(`${res.status}: ${res.message}`);
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-4 font-display text-lg font-semibold">Пользователи</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="pb-2">Логин</th>
                <th className="pb-2">Email</th>
                <th className="pb-2">Статус</th>
                <th className="pb-2">Роли</th>
                <th className="pb-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="py-2">{u.username}</td>
                  <td className="py-2">{u.email}</td>
                  <td className="py-2">
                    <Badge
                      tone={
                        u.status === "active" ? "ok" : u.status === "pending" ? "warn" : "danger"
                      }
                    >
                      {u.status}
                    </Badge>
                  </td>
                  <td className="py-2 text-muted">{u.roles.join(", ")}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      {u.status === "pending" ? (
                        <>
                          <Button type="button" onClick={() => approve(u.id)}>
                            Подтвердить
                          </Button>
                          <Button type="button" variant="secondary" onClick={() => reject(u.id)}>
                            Отклонить
                          </Button>
                        </>
                      ) : null}
                      {u.status === "active" && !u.is_super_admin ? (
                        <Button type="button" variant="ghost" onClick={() => disable(u.id)}>
                          Отключить
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-display text-lg font-semibold">Создать пользователя</h2>
          <form className="space-y-3" onSubmit={createUser}>
            <Input
              label="Логин"
              value={createForm.username}
              onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
              required
            />
            <Input
              label="Email"
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              required
            />
            <Input
              label="Пароль"
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              required
            />
            <Input
              label="ФИО"
              value={createForm.full_name}
              onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
            />
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Роль</span>
              <select
                className={selectClass}
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                required
              >
                {roles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name || r.code} ({r.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Группа</span>
              <select
                className={selectClass}
                value={createForm.group_id}
                onChange={(e) => setCreateForm({ ...createForm, group_id: e.target.value })}
              >
                <option value="">Без группы</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.source})
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit">Создать</Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 font-display text-lg font-semibold">Группы</h2>
          <ul className="mb-4 space-y-2 text-sm">
            {groups.length === 0 ? (
              <li className="text-muted">Пока нет групп</li>
            ) : (
              groups.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                >
                  <span className="min-w-0 truncate">
                    {g.name}{" "}
                    <Badge tone={g.source === "ad" ? "accent" : "neutral"}>{g.source}</Badge>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="shrink-0 text-muted hover:text-danger"
                    disabled={busyGroupId === g.id}
                    onClick={() => deleteGroup(g.id, g.name)}
                    aria-label={`Удалить группу ${g.name}`}
                    title="Удалить"
                  >
                    <Trash2 size={14} />
                  </Button>
                </li>
              ))
            )}
          </ul>
          <form className="mb-4 flex gap-2" onSubmit={createGroup}>
            <div className="flex-1">
              <Input
                label="Новая локальная группа"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit">Добавить</Button>
            </div>
          </form>
          <Button type="button" variant="secondary" onClick={syncAd}>
            Синхронизация AD
          </Button>
          {adSyncMsg ? <p className="mt-2 text-sm text-muted">{adSyncMsg}</p> : null}
        </Card>
      </div>

      {msg ? <p className="text-sm text-ok">{msg}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
