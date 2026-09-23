import { AssetsPageClient } from "@/components/assets/assets-page-client";
import { getSession, getUserRole, hasMinRole } from "@/lib/auth/rbac";

export default async function AssetsPage() {
  const session = await getSession();
  const role = getUserRole(session?.user);
  const canMutate = hasMinRole(role, "analyst");

  return <AssetsPageClient canMutate={canMutate} />;
}
