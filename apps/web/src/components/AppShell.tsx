"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
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
          <div className="text-sm text-muted">Внутренняя система управления уязвимостями</div>
          <Link href="/login" className="text-sm text-accent2 hover:underline">
            Выйти
          </Link>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
