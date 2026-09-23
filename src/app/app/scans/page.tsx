import { ScansPageClient } from "@/components/scans/scans-page-client";
import { getSession, getUserRole, hasMinRole } from "@/lib/auth/rbac";

export default async function ScansPage() {
  const session = await getSession();
  const role = getUserRole(session?.user);
  const canCreate = hasMinRole(role, "analyst");

  return <ScansPageClient canCreate={canCreate} />;
}
