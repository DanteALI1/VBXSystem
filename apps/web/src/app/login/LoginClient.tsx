"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { resolveSessionMode, setTokens } from "@/lib/api";

type LoginResult = {
  access_token?: string;
  refresh_token?: string;
  requires_2fa?: boolean;
  temp_token?: string;
};

type Branding = {
  product_name: string;
  organization_name: string;
  login_title: string;
  login_text: string;
  mark: string;
};

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [brand, setBrand] = useState<Branding | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const demoPrefill = process.env.NEXT_PUBLIC_VBX_DEMO === "1";

  useEffect(() => {
    if (demoPrefill) setUsername("admin");
  }, [demoPrefill]);

  useEffect(() => {
    fetch("/api/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setBrand(d))
      .catch(() => undefined);
  }, []);

  async function finish(data: LoginResult) {
    if (data.requires_2fa && data.temp_token) {
      setTempToken(data.temp_token);
      return;
    }
    const cookieMode = await resolveSessionMode();
    if (!cookieMode) {
      if (!data.access_token) throw new Error("Токен не получен");
      setTokens(data.access_token, data.refresh_token);
    }
    router.push(next);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (tempToken) {
        const res = await fetch("/api/auth/login/2fa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            temp_token: tempToken,
            code: totpCode,
            device_label: navigator.userAgent.slice(0, 80),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Ошибка 2FA");
        await finish(data);
      } else {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            username,
            password,
            device_label: navigator.userAgent.slice(0, 80),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Ошибка входа");
        await finish(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  const product = brand?.product_name || "VBX";
  const org = brand?.organization_name || "";
  const title = brand?.login_title || "Корпоративная база уязвимостей";
  const text =
    brand?.login_text ||
    "NVD · БДУ ФСТЭК · CISA KEV · EPSS · заявки. Локальное развёртывание для команд ИБ.";
  const mark = brand?.mark || "VBX";

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden border-r border-border bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_420px_at_20%_10%,rgba(59,130,246,0.28),transparent_55%),radial-gradient(500px_300px_at_80%_90%,rgba(37,99,235,0.12),transparent_50%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent2 text-sm font-bold text-white shadow-soft">
              {mark}
            </div>
            <div>
              <div className="font-display text-xl font-semibold tracking-tight">{product}</div>
              <div className="text-xs uppercase tracking-wider text-muted">
                {org ? `${org} · ` : ""}Vulnerability Intelligence
              </div>
            </div>
          </div>
          <h1 className="mt-14 max-w-md font-display text-3xl font-semibold leading-tight tracking-tight">
            {title}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">{text}</p>
          <ul className="mt-8 space-y-3 text-sm text-muted">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent2" />
              Единая карточка: CVE + KEV + БДУ + локальный ID
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent2" />
              EPSS, CVEQL, XDB и внутренние заявки
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent2" />
              On-prem: Docker Compose / РЕД ОС
            </li>
          </ul>
        </div>
        <div className="relative text-xs text-muted">
          <Shield size={14} className="mb-2 text-accent2" />
          {product} · локальная платформа ИБ
        </div>
      </aside>

      <main className="relative flex items-center justify-center px-4 py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_320px_at_70%_-10%,rgba(59,130,246,0.18),transparent_55%)] lg:hidden"
        />
        <div className="relative w-full max-w-md vbx-fade-in">
          <div className="mb-8 lg:hidden">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent2 text-sm font-bold text-white">
              {mark}
            </div>
            <h1 className="font-display text-2xl font-semibold">{product}</h1>
            <p className="text-sm text-muted">Vulnerability Intelligence</p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-surface/90 p-6 shadow-soft">
            <h2 className="mb-1 font-display text-lg font-semibold">
              {tempToken ? "Двухфакторная аутентификация" : "Вход в систему"}
            </h2>
            <p className="mb-5 text-sm text-muted">
              {tempToken
                ? "Введите код из приложения-аутентификатора"
                : demoPrefill
                  ? "Демо-режим: логин подсказан. Смените пароль после первого входа."
                  : "Корпоративный доступ к базе уязвимостей"}
            </p>
            <form className="space-y-4" onSubmit={onSubmit}>
              {!tempToken ? (
                <>
                  <Input
                    label="Логин или email"
                    name="username"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                  <Input
                    label="Пароль"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </>
              ) : (
                <Input
                  label="Код из приложения / recovery"
                  name="totp"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  required
                />
              )}
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Проверка…" : tempToken ? "Подтвердить" : "Войти"}
              </Button>
            </form>
            <p className="mt-5 text-center text-sm text-muted">
              Нет аккаунта?{" "}
              <Link href="/register" className="text-accent2 hover:underline">
                Регистрация
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
