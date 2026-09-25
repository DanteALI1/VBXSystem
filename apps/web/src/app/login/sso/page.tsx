"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveSessionMode, setTokens } from "@/lib/api";

function SsoFinishInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const access = params.get("access_token");
        const refresh = params.get("refresh_token") || undefined;
        const next = params.get("next") || "/dashboard";
        const cookieMode = await resolveSessionMode();
        if (!cookieMode) {
          if (!access) throw new Error("Токен SSO не получен");
          setTokens(access, refresh);
        }
        if (!cancelled) router.replace(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка SSO");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-danger/40 bg-surface p-6 text-sm text-danger">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted">
      Завершение входа через SSO…
    </div>
  );
}

export default function SsoFinishPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">SSO…</div>}>
      <SsoFinishInner />
    </Suspense>
  );
}
