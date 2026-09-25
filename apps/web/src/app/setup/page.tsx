"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type Status = {
  completed: boolean;
  needs_setup: boolean;
  can_skip: boolean;
  organization_name: string;
  product_name: string;
  login_title: string;
  login_text: string;
};

type Step = "org" | "branding" | "finish";

export default function SetupWizardPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [step, setStep] = useState<Step>("org");
  const [org, setOrg] = useState("");
  const [product, setProduct] = useState("VBX");
  const [loginTitle, setLoginTitle] = useState("");
  const [loginText, setLoginText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/setup");
      return;
    }
    api<Status>("/setup/status")
      .then((s) => {
        setStatus(s);
        setOrg(s.organization_name || "");
        setProduct(s.product_name || "VBX");
        setLoginTitle(s.login_title || "");
        setLoginText(s.login_text || "");
        if (s.completed) {
          router.replace("/dashboard");
        }
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Ошибка"));
  }, [loading, user, router]);

  async function saveOrg(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/setup/organization", {
        method: "PUT",
        body: JSON.stringify({ organization_name: org }),
      });
      setStep("branding");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function saveBranding(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/setup/branding", {
        method: "PUT",
        body: JSON.stringify({
          product_name: product,
          login_title: loginTitle,
          login_text: loginText,
        }),
      });
      setStep("finish");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setErr(null);
    try {
      await api("/setup/finish", { method: "POST" });
      router.replace("/dashboard");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    try {
      await api("/setup/skip", { method: "POST" });
      router.replace("/dashboard");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !status) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg text-sm text-muted">
        Загрузка мастера…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg px-4 py-10" data-testid="setup-wizard">
      <div className="mx-auto max-w-lg space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">VBX · First run</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Настройка</h1>
          <p className="mt-1 text-sm text-muted">
            Шаг {step === "org" ? "1" : step === "branding" ? "2" : "3"} из 3:{" "}
            {step === "org" ? "Организация" : step === "branding" ? "Брендинг" : "Готово"}
          </p>
        </div>

        {err && (
          <Card className="border-danger/40 text-sm text-danger" role="alert">
            {err}
          </Card>
        )}

        {step === "org" && (
          <Card>
            <form onSubmit={saveOrg} className="space-y-3">
              <Input
                label="Организация"
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                required
                placeholder="АО Пример"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  Далее
                </Button>
                {status.can_skip && (
                  <Button type="button" variant="ghost" disabled={busy} onClick={skip}>
                    Пропустить
                  </Button>
                )}
              </div>
            </form>
          </Card>
        )}

        {step === "branding" && (
          <Card>
            <form onSubmit={saveBranding} className="space-y-3">
              <Input label="Название продукта" value={product} onChange={(e) => setProduct(e.target.value)} />
              <Input
                label="Заголовок login"
                value={loginTitle}
                onChange={(e) => setLoginTitle(e.target.value)}
              />
              <label className="block text-sm">
                <span className="mb-1.5 block text-muted">Текст login</span>
                <textarea
                  className="vbx-field min-h-[90px]"
                  value={loginText}
                  onChange={(e) => setLoginText(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" onClick={() => setStep("org")}>
                  Назад
                </Button>
                <Button type="submit" disabled={busy}>
                  Далее
                </Button>
              </div>
            </form>
          </Card>
        )}

        {step === "finish" && (
          <Card className="space-y-3">
            <p className="text-sm text-muted">
              Организация: <strong className="text-text">{org || "—"}</strong>
              <br />
              Продукт: <strong className="text-text">{product || "VBX"}</strong>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep("branding")}>
                Назад
              </Button>
              <Button type="button" disabled={busy} onClick={finish}>
                Завершить → Dashboard
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
