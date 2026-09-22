import { AppShell } from "@/components/app-shell/app-shell";
import type { AppRole } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const role = (session.user.role ?? "viewer") as AppRole;

  return (
    <AppShell
      user={{
        email: session.user.email,
        name: session.user.name,
        role,
      }}
    >
      {children}
    </AppShell>
  );
}
