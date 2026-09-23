"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  Box,
  Building2,
  ClipboardList,
  LayoutDashboard,
  Package,
  Radar,
  Settings2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  match?: "exact" | "prefix";
};

type NavGroup = {
  label?: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      {
        href: "/app",
        label: "Dashboard",
        icon: LayoutDashboard,
        match: "exact",
      },
      {
        href: "/app/vulnerabilities",
        label: "Vulnerabilities",
        icon: ShieldAlert,
      },
      { href: "/app/vendors", label: "Vendors", icon: Building2 },
      { href: "/app/products", label: "Products", icon: Package },
      { href: "/app/assets", label: "Assets", icon: Box },
      { href: "/app/findings", label: "Findings", icon: ClipboardList },
      { href: "/app/scans", label: "Scans", icon: Radar },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        href: "/app/settings/sync",
        label: "Sync",
        icon: Settings2,
      },
      {
        href: "/app/settings/allowlist",
        label: "Allowlist",
        icon: ShieldCheck,
      },
    ],
  },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-4 px-2 py-3" aria-label="Main">
      {NAV_GROUPS.map((group, index) => (
        <div key={group.label ?? `group-${index}`} className="space-y-1">
          {group.label ? (
            <p className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
              {group.label}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                      active
                        ? "bg-zinc-200/80 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="size-3.5 shrink-0 opacity-80" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
