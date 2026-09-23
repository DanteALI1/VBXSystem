"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, User } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    organization: "",
    title: "",
    phone: "",
  });
  const [pwd, setPwd] = useState({ current_password: "", new_password: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [me, setMe] = useState<User | null>(null);

  useEffect(() => {
    if (!user) return;
    setMe(user);
    setForm({
      full_name: user.full_name || "",
      email: user.email || "",
      organization: user.organization || "",
      title: user.title || "",
      phone: user.phone || "",
    });
  }, [user]);

  if (loading || !me) return <div className="text-sm text-muted">Загрузка профиля…</div>;

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    try {
      const updated = await api<User>("/profile", { method: "PATCH", body: JSON.stringify(form) });
      setMe(updated);
      setMsg("Профиль сохранён");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    try {
      const res = await api<{ message: string }>("/profile/change-password", {
        method: "POST",
        body: JSON.stringify(pwd),
      });
      setMsg(res.message);
      setPwd({ current_password: "", new_password: "" });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  async function setup2fa() {
    setErr(null);
    try {
      const data = await api<{ qr_png_base64: string }>("/auth/2fa/setup", { method: "POST" });
      setQr(data.qr_png_base64);
      setRecovery(null);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  async function enable2fa(e: FormEvent) {
    e.preventDefault();
    try {
      const data = await api<{ recovery_codes: string[]; message: string }>("/auth/2fa/enable", {
        method: "POST",
        body: JSON.stringify({ code: totpCode }),
      });
      setRecovery(data.recovery_codes);
      setMsg(data.message);
      setMe((m) => (m ? { ...m, totp_enabled: true } : m));
      setQr(null);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  async function disable2fa(e: FormEvent) {
    e.preventDefault();
    try {
      const data = await api<{ message: string }>("/auth/2fa/disable", {
        method: "POST",
        body: JSON.stringify({ code: totpCode }),
      });
      setMsg(data.message);
      setMe((m) => (m ? { ...m, totp_enabled: false } : m));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="mb-4 font-display text-lg font-semibold">Профиль</h2>
        <form className="space-y-3" onSubmit={saveProfile}>
          <Input label="ФИО" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Организация" value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} />
          <Input label="Должность" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input label="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Button type="submit">Сохранить</Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-4 font-display text-lg font-semibold">Смена пароля</h2>
        <form className="space-y-3" onSubmit={changePassword}>
          <Input
            label="Текущий пароль"
            type="password"
            value={pwd.current_password}
            onChange={(e) => setPwd({ ...pwd, current_password: e.target.value })}
          />
          <Input
            label="Новый пароль"
            type="password"
            value={pwd.new_password}
            onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })}
          />
          <Button type="submit">Обновить пароль</Button>
        </form>
      </Card>

      <Card className="lg:col-span-2">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="font-display text-lg font-semibold">Двухфакторная аутентификация</h2>
          <Badge tone={me.totp_enabled ? "ok" : "neutral"}>{me.totp_enabled ? "Включена" : "Выключена"}</Badge>
        </div>
        {!me.totp_enabled ? (
          <div className="space-y-3">
            <Button type="button" onClick={setup2fa}>
              Настроить 2FA
            </Button>
            {qr ? (
              <form className="space-y-3" onSubmit={enable2fa}>
                <img src={`data:image/png;base64,${qr}`} alt="QR 2FA" className="h-40 w-40 rounded-xl bg-white p-2" />
                <Input label="Код подтверждения" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} />
                <Button type="submit">Включить 2FA</Button>
              </form>
            ) : null}
          </div>
        ) : (
          <form className="max-w-sm space-y-3" onSubmit={disable2fa}>
            <Input label="Код для отключения" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} />
            <Button type="submit" variant="secondary">
              Отключить 2FA
            </Button>
          </form>
        )}
        {recovery ? (
          <div className="mt-4 rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm">
            <div className="mb-2 font-medium text-warn">Коды восстановления (сохраните):</div>
            <ul className="grid gap-1 font-mono sm:grid-cols-2">
              {recovery.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {msg ? <p className="text-sm text-ok lg:col-span-2">{msg}</p> : null}
      {err ? <p className="text-sm text-danger lg:col-span-2">{err}</p> : null}
    </div>
  );
}
