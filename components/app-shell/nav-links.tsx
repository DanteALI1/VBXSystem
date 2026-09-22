"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/app", label: "Dashboard", match: "exact" as const },
  { href: "/app/vulnerabilities", label: "Vulnerabilities" },
  { href: "/app/assets", label: "Assets" },
  { href: "/app/findings", label: "Findings" },
  { href: "/app/scans", label: "Scans" },
  { href: "/app/settings/sync", label: "Sync" },
  { href: "/app/settings/allowlist", label: "Allowlist" },
] as const;

function isActive(pathname: string, href: string, match?: "exact") {
  if (match === "exact") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-0.5 text-sm">
      {NAV_ITEMS.map((item) => {
        const active = isActive(
          pathname,
          item.href,
          "match" in item ? item.match : undefined,
        );
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2 py-1 transition-colors",
              active
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
