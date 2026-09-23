import { Suspense } from "react";
import { FindingsPageClient } from "@/components/findings/findings-page-client";
import { getSession, getUserRole, hasMinRole } from "@/lib/auth/rbac";

export default async function FindingsPage() {
  const session = await getSession();
  const role = getUserRole(session?.user);
  const canTransition = hasMinRole(role, "analyst");

  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground" data-testid="findings-loading">
          Loading findings…
        </p>
      }
    >
      <FindingsPageClient canTransition={canTransition} />
    </Suspense>
  );
}
