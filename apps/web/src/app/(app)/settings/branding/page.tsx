"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type Branding = {
  product_name: string;
  organization_name: string;
  login_title: string;
  login_text: string;
  local_id_prefix: string;
  mark: string;
};

export default function BrandingSettingsPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<Branding | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canAdmin = !!user && (user.is_super_admin || user.roles.includes("admin"));

  useEffect(() => {
    if (!canAdmin) return;
    api<Branding>("/settings/branding")
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [canAdmin]);

  if (loading) return <div className="text-sm text-muted">Загрузка…</div>;
  if (!canAdmin) return <Card>Раздел доступен администратору.</Card>;
  if (!data) return <div className="text-sm text-muted">Загрузка брендинга…</div>;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    try {
      const res = await api<{ message: string }>("/settings/branding", {
        method: "PUT",
        body: JSON.stringify(data),
      });
      setMsg(res.message);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold">Брендинг</h2>
      <p className="mt-1 text-sm text-muted">
        Название продукта, организация и тексты экрана входа (паттерн VULNEX, стиль VBX).
      </p>
      <form className="mt-5 space-y-4" onSubmit={onSave}>
        <Input
          label="Название продукта"
          value={data.product_name}
          onChange={(e) => setData({ ...data, product_name: e.target.value })}
        />
        <Input
          label="Организация"
          value={data.organization_name}
          onChange={(e) => setData({ ...data, organization_name: e.target.value })}
        />
        <Input
          label="Заголовок на экране входа"
          value={data.login_title}
          onChange={(e) => setData({ ...data, login_title: e.target.value })}
        />
        <label className="block text-sm">
          <span className="mb-1.5 block text-muted">Текст на экране входа</span>
          <textarea
            className="w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
            rows={4}
            value={data.login_text}
            onChange={(e) => setData({ ...data, login_text: e.target.value })}
          />
        </label>
        <Input
          label="Префикс локальных ID"
          value={data.local_id_prefix}
          onChange={(e) => setData({ ...data, local_id_prefix: e.target.value.toUpperCase() })}
        />
        <p className="text-xs text-muted">
          Локальные записи: <span className="font-mono text-accent2">{data.local_id_prefix || "VBX"}-YYYY-NNNN</span>
        </p>
        {msg ? <p className="text-sm text-ok">{msg}</p> : null}
        {err ? <p className="text-sm text-danger">{err}</p> : null}
        <Button type="submit">Сохранить</Button>
      </form>
    </Card>
  );
}
