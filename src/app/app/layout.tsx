import type { ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { QueryProvider } from "@/components/providers/query-provider";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AppShell>{children}</AppShell>
    </QueryProvider>
  );
}
