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
      <div className="grid min-h-screen place-items-center text-sm text-muted">Загрузка сессии…</div>
    );
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-border bg-surface/80 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20 text-accent2">
            <Shield size={18} />
          </div>
          <div>
            <div className="font-display text-lg font-semibold tracking-tight">VBX</div>
            <div className="text-xs text-muted">Vulnerability Intelligence</div>
          </div>
        </div>
        <nav className="space-y-1 px-3 pb-6">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              pathname.startsWith(item.href + "/") ||
              (item.href === "/search" &&
                (pathname.startsWith("/vuln/") || pathname.startsWith("/bdu/")));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-accent/15 text-accent2"
                    : "text-muted hover:bg-surface2 hover:text-text"
                }`}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="text-sm text-muted">
            {user ? (
              <>
                {user.full_name || user.username}
                {user.is_super_admin ? " · Главный администратор" : ""}
              </>
            ) : (
              "Внутренняя система управления уязвимостями"
            )}
          </div>
          <button type="button" onClick={logout} className="text-sm text-accent2 hover:underline">
            Выйти
          </button>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
