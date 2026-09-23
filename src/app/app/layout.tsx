import type { ReactNode } from "react";
import { headers } from "next/headers";
import { AppShell } from "@/components/app/app-shell";
import { QueryProvider } from "@/components/providers/query-provider";
import { auth } from "@/lib/auth/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  const email = session?.user?.email ?? null;
  const role =
    (session?.user as { role?: string } | undefined)?.role ?? null;

  return (
    <QueryProvider>
      <AppShell userEmail={email} userRole={role}>
        {children}
      </AppShell>
    </QueryProvider>
  );
}
