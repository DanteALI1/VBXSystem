import type { ReactNode } from "react";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { SignOutButton } from "@/app/app/sign-out-button";

export function AppShell({
  children,
  userEmail,
  userRole,
}: {
  children: ReactNode;
  userEmail?: string | null;
  userRole?: string | null;
}) {
  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-zinc-200 bg-zinc-100/90 dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="flex h-11 items-center gap-2 border-b border-zinc-200 px-3 dark:border-zinc-800">
          <span className="inline-flex size-6 items-center justify-center rounded bg-zinc-800 text-[10px] font-bold tracking-tight text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900">
            VX
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold tracking-tight">VBX</p>
            <p className="truncate text-[10px] text-zinc-500">Security console</p>
          </div>
        </div>
        <SidebarNav />
        <div className="mt-auto space-y-1 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
          {userEmail ? (
            <p
              className="truncate text-[10px] text-zinc-600 dark:text-zinc-400"
              data-testid="session-email"
            >
              {userEmail}
            </p>
          ) : null}
          {userRole ? (
            <p
              className="truncate text-[10px] font-medium uppercase tracking-wide text-zinc-500"
              data-testid="session-role"
            >
              {userRole}
            </p>
          ) : null}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs text-zinc-500">Vulnerability management</p>
          <SignOutButton />
        </header>
        <main className="flex-1 overflow-auto p-4">{children}</main>
      </div>
    </div>
  );
}
