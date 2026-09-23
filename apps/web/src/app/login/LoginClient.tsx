"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { setTokens } from "@/lib/api";

type LoginResult = {
  access_token?: string;
  refresh_token?: string;
  requires_2fa?: boolean;
  temp_token?: string;
};

export default function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function finish(data: LoginResult) {
    if (data.requires_2fa && data.temp_token) {
      setTempToken(data.temp_token);
      return;
    }
    if (!data.access_token) throw new Error("Токен не получен");
    setTokens(data.access_token, data.refresh_token);
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

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <Card className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/20 text-accent2">
            <Shield size={22} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">VBXSystem</h1>
            <p className="text-sm text-muted">
              {tempToken ? "Двухфакторная аутентификация" : "Вход в систему"}
            </p>
          </div>
        </div>
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
        <p className="mt-4 text-sm text-muted">
          Нет аккаунта?{" "}
          <Link href="/register" className="text-accent2 hover:underline">
            Регистрация
          </Link>
        </p>
      </Card>
    </div>
  );
}
