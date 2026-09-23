"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Ошибка входа");
      }
      const data = await res.json();
      localStorage.setItem("vbx_access_token", data.access_token);
      localStorage.setItem("vbx_refresh_token", data.refresh_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <Card className="w-full max-w-md animate-[fadeIn_.45s_ease]">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/20 text-accent2">
            <Shield size={22} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">VBXSystem</h1>
            <p className="text-sm text-muted">Вход в систему</p>
          </div>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
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
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Вход…" : "Войти"}
          </Button>
        </form>
        <p className="mt-4 text-xs text-muted">
          Саморегистрация и 2FA появятся в следующей волне. Учётная запись создаётся при установке.
        </p>
      </Card>
      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
