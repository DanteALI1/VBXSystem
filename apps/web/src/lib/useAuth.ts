"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, clearTokens, getToken, User } from "@/lib/api";

export function useAuth(options?: { requireSuperAdmin?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    api<User>("/auth/me")
      .then((u) => {
        if (options?.requireSuperAdmin && !u.is_super_admin) {
          router.replace("/dashboard");
          return;
        }
        setUser(u);
      })
      .catch(() => {
        clearTokens();
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router, pathname, options?.requireSuperAdmin]);

  return { user, loading };
}
