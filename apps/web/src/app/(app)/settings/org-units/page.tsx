"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, hasPermission } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type OrgUnit = {
  id: number;
  name: string;
  parent_id?: number | null;
  created_at?: string | null;
};

type UserRow = {
  id: number;
  username: string;
  full_name?: string;
  email?: string;
};

export default function OrgUnitsPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, "users:write");
  const [units, setUnits] = useState<OrgUnit[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [selectedUser, setSelectedUser] = useState<number | "">("");
  const [userUnits, setUserUnits] = useState<number[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const loadUnits = useCallback(async () => {
    try {
      const rows = await api<OrgUnit[]>("/org-units");
      setUnits(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await api<{ results?: UserRow[] } | UserRow[]>("/users?page_size=100");
      const list = Array.isArray(res) ? res : res.results || [];
      setUsers(list);
    } catch {
      /* ignore if no access */
    }
  }, []);

  useEffect(() => {
    void loadUnits();
    void loadUsers();
  }, [loadUnits, loadUsers]);

  async function createUnit(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setErr(null);
    try {
      await api("/org-units", {
        method: "POST",
        body: JSON.stringify({
          name,
          parent_id: parentId ? Number(parentId) : null,
        }),
      });
      setName("");
      setParentId("");
      setMsg("Орг. единица создана");
      await loadUnits();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }

  async function removeUnit(id: number) {
    if (!canWrite || !confirm("Удалить орг. единицу?")) return;
    try {
      await api(`/org-units/${id}`, { method: "DELETE" });
      await loadUnits();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }

  async function loadUserUnits(uid: number) {
    setSelectedUser(uid);
    try {
      const res = await api<{ org_unit_ids: number[] }>(`/users/${uid}/org-units`);
      setUserUnits(res.org_unit_ids || []);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }

  async function saveUserUnits() {
    if (!canWrite || !selectedUser) return;
    try {
      await api(`/users/${selectedUser}/org-units`, {
        method: "PUT",
        body: JSON.stringify({ org_unit_ids: userUnits }),
      });
      setMsg("Назначение сохранено");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }

  function toggleUnit(id: number) {
    setUserUnits((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="space-y-4" data-testid="org-units-page">
      <div>
        <h2 className="font-display text-lg font-semibold">Орг. единицы</h2>
        <p className="text-sm text-muted">
          Multi-BU RBAC: ограничение видимости assets/findings по бизнес-юнитам.
        </p>
      </div>
      {err ? <p className="text-sm text-danger">{err}</p> : null}
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h2 className="font-medium">Список</h2>
          <ul className="divide-y divide-border text-sm">
            {units.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-2">
                <span>
                  #{u.id} {u.name}
                  {u.parent_id ? (
                    <span className="text-muted"> · parent {u.parent_id}</span>
                  ) : null}
                </span>
                {canWrite ? (
                  <Button variant="ghost" onClick={() => void removeUnit(u.id)}>
                    Удалить
                  </Button>
                ) : null}
              </li>
            ))}
            {!units.length ? (
              <li className="py-2 text-muted">Пока пусто</li>
            ) : null}
          </ul>
          {canWrite ? (
            <form onSubmit={createUnit} className="flex flex-wrap gap-2 pt-2">
              <Input
                placeholder="Название"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                placeholder="parent id"
                className="w-28"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              />
              <Button type="submit">Создать</Button>
            </form>
          ) : null}
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="font-medium">Назначение пользователю</h2>
          <select
            className="w-full rounded border border-border bg-bg px-2 py-2 text-sm"
            value={selectedUser}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : "";
              if (v) void loadUserUnits(v);
              else setSelectedUser("");
            }}
          >
            <option value="">Выберите пользователя</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
                {u.full_name ? ` — ${u.full_name}` : ""}
              </option>
            ))}
          </select>
          {selectedUser ? (
            <>
              <div className="flex flex-col gap-1">
                {units.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={userUnits.includes(u.id)}
                      onChange={() => toggleUnit(u.id)}
                      disabled={!canWrite}
                    />
                    {u.name}
                  </label>
                ))}
              </div>
              {canWrite ? (
                <Button onClick={() => void saveUserUnits()}>Сохранить</Button>
              ) : null}
            </>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
