"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export default function RegisterPage() {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    full_name: "",
    organization: "",
    title: "",
    phone: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function setField(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Ошибка регистрации");
      setMessage(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/20 text-accent2">
            <Shield size={22} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold">Регистрация</h1>
            <p className="text-sm text-muted">Доступ после подтверждения администратором</p>
          </div>
        </div>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
          <Input label="Логин" value={form.username} onChange={(e) => setField("username", e.target.value)} required />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} required />
          <Input label="Пароль" type="password" value={form.password} onChange={(e) => setField("password", e.target.value)} required />
          <Input label="ФИО" value={form.full_name} onChange={(e) => setField("full_name", e.target.value)} />
          <Input label="Организация" value={form.organization} onChange={(e) => setField("organization", e.target.value)} />
          <Input label="Должность" value={form.title} onChange={(e) => setField("title", e.target.value)} />
          <div className="sm:col-span-2">
            <Input label="Телефон" value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
          </div>
          {error ? <p className="sm:col-span-2 text-sm text-danger">{error}</p> : null}
          {message ? <p className="sm:col-span-2 text-sm text-ok">{message}</p> : null}
          <div className="sm:col-span-2">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Отправка…" : "Зарегистрироваться"}
            </Button>
          </div>
        </form>
        <p className="mt-4 text-sm text-muted">
          Уже есть доступ?{" "}
          <Link href="/login" className="text-accent2 hover:underline">
            Войти
          </Link>
        </p>
      </Card>
    </div>
  );
}
