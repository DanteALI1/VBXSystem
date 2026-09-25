"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Search,
  Activity,
  Database,
  Ticket,
  Settings,
  Shield,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  Crosshair,
  Server,
  FolderKanban,
  Network,
  FileText,
} from "lucide-react";
import { logoutRequest, api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };
type NavSection = { title?: string; items: NavItem[] };

const NAV: NavSection[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/search", label: "Search", icon: Search },
      { href: "/epss", label: "EPSS", icon: Activity },
      { href: "/xdb", label: "Exploits", icon: Database },
      { href: "/tickets", label: "Заявки", icon: Ticket },
    ],
  },
  {
    title: "Сканирование",
    items: [
      { href: "/scans", label: "Сканы", icon: Radar },
      { href: "/assets", label: "Узлы", icon: Server },
      { href: "/findings", label: "Находки", icon: Crosshair },
      { href: "/projects", label: "Проекты", icon: FolderKanban },
      { href: "/graph", label: "Граф", icon: Network },
    ],
  },
  {
    items: [
      { href: "/reports", label: "Отчёты", icon: FileText },
      { href: "/settings", label: "Настройки", icon: Settings },
    ],
  },
];

const STORAGE_KEY = "vbx.sidebar.collapsed";

function linkActive(pathname: string, href: string): boolean {
  if (pathname === href || pathname.startsWith(href + "/")) return true;
  if (
    href === "/search" &&
    (pathname.startsWith("/vuln/") ||
      pathname.startsWith("/bdu/") ||
      pathname.startsWith("/local/"))
  ) {
    return true;
  }
  if (href === "/settings" && pathname.startsWith("/settings")) return true;
  return false;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    if (pathname.startsWith("/setup")) return;
    api<{ needs_setup: boolean; completed: boolean }>("/setup/status")
      .then((s) => {
        if (s.needs_setup && !s.completed) {
          router.replace("/setup");
        }
      })
      .catch(() => undefined);
  }, [loading, user, pathname, router]);

  function toggleSidebar() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function logout() {
    await logoutRequest();
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
    <div
      className={`min-h-screen bg-bg lg:grid ${
        collapsed ? "lg:grid-cols-[72px_1fr]" : "lg:grid-cols-[240px_1fr]"
      } ${ready ? "transition-[grid-template-columns] duration-300 ease-out" : ""}`}
    >
      {/* Один фон с контентом — без border/shadow/другого surface, чтобы не было «шва» */}
      <aside
        className={`sticky top-0 z-20 flex flex-col bg-bg lg:h-screen ${
          collapsed ? "lg:items-center" : ""
        }`}
      >
        <div
          className={`flex w-full items-center ${
            collapsed ? "justify-center px-2 py-5" : "gap-3 px-4 py-5"
          }`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent2 text-white shadow-soft">
            <Shield size={18} />
          </div>
          {!collapsed ? (
            <div className="min-w-0 overflow-hidden">
              <div className="font-display text-lg font-semibold tracking-tight text-text">VBX</div>
              <div className="truncate text-[11px] uppercase tracking-wider text-muted">
                Vulnerability Intelligence
              </div>
            </div>
          ) : null}
        </div>

        <nav
          className={`flex-1 space-y-4 pb-4 ${collapsed ? "w-full px-2" : "px-3"}`}
          aria-label="Основное меню"
        >
          {NAV.map((section, si) => (
            <div key={section.title || `nav-${si}`} className="space-y-1">
              {section.title && !collapsed ? (
                <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted/80">
                  {section.title}
                </div>
              ) : null}
              {section.items.map((item) => {
                const active = linkActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    aria-label={item.label}
                    className={`group flex items-center rounded-xl text-sm font-medium transition ${
                      collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
                    } ${
                      active
                        ? "bg-accent/12 text-accent2"
                        : "text-muted hover:bg-white/[0.04] hover:text-text"
                    }`}
                  >
                    <Icon
                      size={16}
                      className={`shrink-0 ${active ? "text-accent2" : "text-muted group-hover:text-text"}`}
                    />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={`mt-auto pb-5 ${collapsed ? "px-2" : "px-3"}`}>
          <button
            type="button"
            onClick={toggleSidebar}
            title={collapsed ? "Развернуть меню" : "Свернуть меню"}
            aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
            aria-expanded={!collapsed}
            className={`hidden w-full items-center rounded-xl py-2.5 text-sm text-muted transition hover:bg-white/[0.04] hover:text-text lg:flex ${
              collapsed ? "justify-center px-0" : "gap-3 px-3"
            }`}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            {!collapsed ? <span>Свернуть</span> : null}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col bg-bg">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-bg/90 px-5 py-3 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={toggleSidebar}
              title={collapsed ? "Развернуть меню" : "Свернуть меню"}
              aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-white/[0.04] hover:text-text lg:hidden"
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
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
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted transition hover:bg-white/[0.04] hover:text-text"
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
