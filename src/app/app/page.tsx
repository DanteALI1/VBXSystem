import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { getUserRole } from "@/lib/auth/rbac";
import { SignOutButton } from "./sign-out-button";

/** Console shell placeholder — KPI widgets land in a later wave. */
export default async function AppHomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const role = getUserRole(session.user);

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="flex items-center justify-between border-b border-zinc-300 bg-zinc-50 px-4 py-2">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm font-semibold tracking-tight">
            VBX
          </span>
          <span className="text-xs text-zinc-500">Console</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-zinc-600" data-testid="session-email">
            {session.user.email}
          </span>
          <span
            className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-mono uppercase"
            data-testid="session-role"
          >
            {role}
          </span>
          <SignOutButton />
        </div>
      </header>
      <div className="p-4">
        <h1 className="text-sm font-medium">Dashboard</h1>
        <p className="mt-1 text-xs text-zinc-600">
          KPI placeholders — Wave 1+ fills counters.
        </p>
      </div>
    </main>
  );
}
