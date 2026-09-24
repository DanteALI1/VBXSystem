"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export default function LocalCreatePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [vendor, setVendor] = useState("");
  const [product, setProduct] = useState("");
  const [remediation, setRemediation] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canWrite =
    !!user &&
    (user.is_super_admin ||
      user.roles.some((r) => ["admin", "analyst", "ticket_manager"].includes(r)));

  if (loading) return <div className="text-sm text-muted">Загрузка…</div>;
  if (!canWrite) return <Card>Недостаточно прав для создания локальной записи.</Card>;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ id: string }>("/local", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          severity,
          vendor,
          product_name: product,
          remediation,
        }),
      });
      router.push(`/local/${encodeURIComponent(res.id)}`);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Локальная уязвимость</h1>
        <p className="text-sm text-muted">
          Внутренний ID вида PREFIX-YYYY-NNNN (как ACME-* в VULNEX)
        </p>
      </div>
      <Card>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Input label="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted">Описание</span>
            <textarea
              className="w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted">Severity</span>
            <select
              className="w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Вендор" value={vendor} onChange={(e) => setVendor(e.target.value)} />
            <Input label="Продукт" value={product} onChange={(e) => setProduct(e.target.value)} />
          </div>
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted">Рекомендации</span>
            <textarea
              className="w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent"
              rows={3}
              value={remediation}
              onChange={(e) => setRemediation(e.target.value)}
            />
          </label>
          {err ? <p className="text-sm text-danger">{err}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Создание…" : "Создать"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
