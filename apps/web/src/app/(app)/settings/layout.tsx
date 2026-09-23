"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

const LINKS = [
  { href: "/settings/profile", label: "Профиль" },
  { href: "/settings/users", label: "Пользователи", superAdmin: true },
  { href: "/settings/database", label: "База данных", admin: true },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="text-sm text-muted">Загрузка…</div>;
  }

  const canDb = !!user && (user.is_super_admin || user.roles.includes("admin"));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Настройки</h1>
        <p className="text-sm text-muted">Профиль, доступ и источники данных</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {LINKS.filter((l) => {
          if (l.superAdmin && !user?.is_super_admin) return false;
          if (l.admin && !canDb) return false;
          return true;
        }).map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-xl px-3 py-2 text-sm ${
                active ? "bg-accent/15 text-accent2" : "bg-surface2 text-muted hover:text-text"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
