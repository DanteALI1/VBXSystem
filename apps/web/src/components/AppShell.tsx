"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  Terminal,
  Activity,
  Database,
  Ticket,
  Settings,
  Shield,
  LogOut,
} from "lucide-react";
import { clearTokens } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/search", label: "Search", icon: Search },
  { href: "/cveql", label: "CVEQL", icon: Terminal },
  { href: "/epss", label: "EPSS", icon: Activity },
  { href: "/xdb", label: "Exploits", icon: Database },
  { href: "/tickets", label: "Заявки", icon: Ticket },
  { href: "/settings", label: "Настройки", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  function logout() {
    clearTokens();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg text-sm text-muted">
        Загрузка сессии…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 z-20 border-b border-border/80 bg-surface/95 backdrop-blur lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent2 text-white shadow-soft">
            <Shield size={18} />
          </div>
          <div className="min-w-0">
            <div className="font-display text-lg font-semibold tracking-tight text-text">VBX</div>
            <div className="truncate text-[11px] uppercase tracking-wider text-muted">
              Vulnerability Intelligence
            </div>
          </div>
        </div>
        <nav className="space-y-0.5 px-3 pb-6" aria-label="Основное меню">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              pathname.startsWith(item.href + "/") ||
              (item.href === "/search" &&
                (pathname.startsWith("/vuln/") ||
                  pathname.startsWith("/bdu/") ||
                  pathname.startsWith("/local/")));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-accent/15 text-accent2 shadow-[inset_3px_0_0_0_var(--vbx-accent)]"
                    : "text-muted hover:bg-surface2 hover:text-text"
                }`}
              >
                <Icon
                  size={16}
                  className={active ? "text-accent2" : "text-muted group-hover:text-text"}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border/80 bg-bg/80 px-5 py-3 backdrop-blur md:px-8">
          <div className="min-w-0 text-sm text-muted">
            {user ? (
              <span className="truncate">
                <span className="text-text">{user.full_name || user.username}</span>
                {user.is_super_admin ? (
                  <span className="hidden sm:inline"> · Главный администратор</span>
                ) : null}
              </span>
            ) : (
              "Внутренняя система управления уязвимостями"
            )}
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface2 px-3 py-1.5 text-sm text-muted transition hover:border-accent/40 hover:text-text"
          >
            <LogOut size={14} />
            Выйти
          </button>
        </header>
        <main className="vbx-fade-in flex-1 px-5 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
