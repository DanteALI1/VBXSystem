"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type Entry = {
  id: number;
  org_key: string;
  kind: string;
  value: string;
  created_at?: string | null;
};

export default function WatchlistSettingsPage() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [kind, setKind] = useState("vendor");
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setRows(await api<Entry[]>("/watchlist"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      await api("/watchlist", {
        method: "POST",
        body: JSON.stringify({ kind, value }),
      });
      setValue("");
      setMsg("Добавлено в watchlist организации");
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  async function onDelete(id: number) {
    setErr(null);
    try {
      await api(`/watchlist/${id}`, { method: "DELETE" });
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-display text-lg font-semibold">Watchlist организации</h2>
        <p className="mt-1 text-sm text-muted">
          Общий список по полю «Организация» в профиле. Попадает в ленту «Требует внимания» на dashboard.
          Виды: CVE id, vendor или product.
        </p>
        <form onSubmit={onAdd} className="mt-4 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Тип</span>
            <select
              className="vbx-field w-auto"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="cve">CVE</option>
              <option value="vendor">Vendor</option>
              <option value="product">Product</option>
            </select>
          </label>
          <label className="min-w-[220px] flex-1 text-sm">
            <span className="mb-1 block text-muted">Значение</span>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === "cve" ? "CVE-2024-1234" : "Microsoft"}
              required
            />
          </label>
          <Button type="submit">Добавить</Button>
        </form>
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        {msg && <p className="mt-3 text-sm text-ok">{msg}</p>}
      </Card>

      <Card>
        <h3 className="text-sm font-medium text-muted">
          {loading ? "Загрузка…" : `${rows.length} правил`}
        </h3>
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">{r.kind}</Badge>
                <span className="font-mono text-sm">{r.value}</span>
              </div>
              <Button type="button" variant="ghost" onClick={() => onDelete(r.id)}>
                Удалить
              </Button>
            </li>
          ))}
          {!loading && !rows.length && (
            <li className="text-sm text-muted">Пока пусто — добавьте vendor/product или CVE.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
