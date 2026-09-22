import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "@/lib/auth";
import type { AppRole } from "@/lib/auth/roles";

export type AppSession = Session;

export async function getSession(): Promise<AppSession | null> {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireSession(): Promise<AppSession> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function getSessionRole(): Promise<AppRole | null> {
  const session = await getSession();
  const role = session?.user?.role;
  if (role === "admin" || role === "analyst" || role === "viewer") {
    return role;
  }
  return null;
}
