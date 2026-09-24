"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, clearTokens, getToken, resolveSessionMode, User } from "@/lib/api";

export function useAuth(options?: { requireSuperAdmin?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cookieMode = await resolveSessionMode();
      if (!cookieMode && !getToken()) {
        if (!cancelled) {
          setLoading(false);
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        }
        return;
      }
      try {
        const u = await api<User>("/auth/me");
        if (cancelled) return;
        if (options?.requireSuperAdmin && !u.is_super_admin) {
          router.replace("/dashboard");
          return;
        }
        setUser(u);
      } catch {
        if (!cancelled) {
          clearTokens();
          router.replace("/login");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, pathname, options?.requireSuperAdmin]);

  return { user, loading };
}
