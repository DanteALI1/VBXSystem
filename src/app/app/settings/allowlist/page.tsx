import { AllowlistPageClient } from "@/components/allowlist/allowlist-page-client";
import { getSession, getUserRole, hasRole } from "@/lib/auth/rbac";

export default async function AllowlistSettingsPage() {
  const session = await getSession();
  const role = getUserRole(session?.user);
  const canMutate = hasRole(role, ["admin"]);

  return <AllowlistPageClient canMutate={canMutate} />;
}
