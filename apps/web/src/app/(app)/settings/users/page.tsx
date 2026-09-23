"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, User } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type Group = { id: number; name: string; source: string; description: string };
type Role = { code: string; name: string };

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
    roles: "viewer",
  });
  const [groupName, setGroupName] = useState("");
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
  }

  useEffect(() => {
    if (!user?.is_super_admin) return;
    reload().catch((e) => setError(e.message));
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
      await api("/users", {
        method: "POST",
        body: JSON.stringify({
          ...createForm,
          roles: createForm.roles.split(",").map((s) => s.trim()).filter(Boolean),
          status: "active",
        }),
      });
      setMsg("Пользователь создан");
      setCreateForm({ username: "", email: "", password: "", full_name: "", roles: "viewer" });
      await reload();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  async function createGroup(e: FormEvent) {
    e.preventDefault();
    await api("/groups", {
      method: "POST",
      body: JSON.stringify({ name: groupName, source: "local", description: "" }),
    });
    setGroupName("");
    await reload();
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
            <Input label="Логин" value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} required />
            <Input label="Email" type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required />
            <Input label="Пароль" type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required />
            <Input label="ФИО" value={createForm.full_name} onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} />
            <Input
              label={`Роли (${roles.map((r) => r.code).join(", ")})`}
              value={createForm.roles}
              onChange={(e) => setCreateForm({ ...createForm, roles: e.target.value })}
            />
            <Button type="submit">Создать</Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 font-display text-lg font-semibold">Группы</h2>
          <ul className="mb-4 space-y-2 text-sm">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                <span>
                  {g.name}{" "}
                  <Badge tone={g.source === "ad" ? "accent" : "neutral"}>{g.source}</Badge>
                </span>
              </li>
            ))}
          </ul>
          <form className="mb-4 flex gap-2" onSubmit={createGroup}>
            <div className="flex-1">
              <Input label="Новая локальная группа" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button type="submit">Добавить</Button>
            </div>
          </form>
          <Button type="button" variant="secondary" onClick={syncAd}>
            Синхронизация AD (черновик W6)
          </Button>
          {adSyncMsg ? <p className="mt-2 text-sm text-muted">{adSyncMsg}</p> : null}
        </Card>
      </div>

      {msg ? <p className="text-sm text-ok">{msg}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
