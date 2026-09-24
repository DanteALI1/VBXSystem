export type User = {
  id: number;
  username: string;
  email: string;
  full_name: string;
  organization: string;
  title: string;
  phone: string;
  status: string;
  is_super_admin: boolean;
  totp_enabled: boolean;
  roles: string[];
  groups: string[];
};

const TOKEN_KEY = "vbx_access_token";
const REFRESH_KEY = "vbx_refresh_token";
const MODE_KEY = "vbx_session_mode";

let cookiesModeCache: boolean | null = null;

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh?: string) {
  if (cookiesModeCache) return;
  localStorage.setItem(TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export async function resolveSessionMode(): Promise<boolean> {
  if (cookiesModeCache != null) return cookiesModeCache;
  if (typeof window !== "undefined") {
    const cached = sessionStorage.getItem(MODE_KEY);
    if (cached === "cookies") {
      cookiesModeCache = true;
      return true;
    }
    if (cached === "bearer") {
      cookiesModeCache = false;
      return false;
    }
  }
  try {
    const res = await fetch("/api/auth/session-mode", { credentials: "include" });
    if (res.ok) {
      const data = (await res.json()) as { cookies?: boolean };
      cookiesModeCache = !!data.cookies;
    } else {
      cookiesModeCache = false;
    }
  } catch {
    cookiesModeCache = false;
  }
  if (typeof window !== "undefined") {
    sessionStorage.setItem(MODE_KEY, cookiesModeCache ? "cookies" : "bearer");
  }
  return cookiesModeCache;
}

export function isCookiesMode(): boolean {
  return !!cookiesModeCache;
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const cookieMode = await resolveSessionMode();
    try {
      const body = cookieMode
        ? "{}"
        : JSON.stringify({ refresh_token: getRefreshToken() || "" });
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body,
      });
      if (!res.ok) {
        clearTokens();
        return false;
      }
      const data = (await res.json()) as { access_token?: string; refresh_token?: string };
      if (!cookieMode) {
        if (!data.access_token) {
          clearTokens();
          return false;
        }
        setTokens(data.access_token, data.refresh_token);
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function logoutRequest() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    /* ignore */
  }
  clearTokens();
  if (typeof window !== "undefined") sessionStorage.removeItem(MODE_KEY);
  cookiesModeCache = null;
}

export async function api<T>(
  path: string,
  options: RequestInit & { auth?: boolean; _retried?: boolean } = {},
): Promise<T> {
  const cookieMode = await resolveSessionMode();
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (options.auth !== false && !cookieMode) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  if (res.status === 401 && options.auth !== false && !options._retried) {
    const ok = await tryRefresh();
    if (ok) {
      return api<T>(path, { ...options, _retried: true });
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "Ошибка запроса";
    throw new Error(detail);
  }
  return data as T;
}
