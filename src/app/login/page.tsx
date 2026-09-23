import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-200/80 via-zinc-100 to-zinc-200 p-4">
      <div className="w-full max-w-[360px] border border-zinc-300/80 bg-zinc-50 p-5 shadow-sm">
        <div className="mb-4 border-b border-zinc-200 pb-3">
          <p className="font-mono text-lg font-semibold tracking-tight text-zinc-900">
            VBX
          </p>
          <p className="mt-0.5 text-xs text-zinc-600">
            Vulnerability management console
          </p>
        </div>
        <Suspense
          fallback={
            <p className="text-xs text-muted-foreground">Loading form…</p>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
