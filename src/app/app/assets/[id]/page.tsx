import { AssetDetailClient } from "@/components/assets/asset-detail-client";
import { getSession, getUserRole, hasMinRole, hasRole } from "@/lib/auth/rbac";

type Params = { params: Promise<{ id: string }> };

export default async function AssetDetailPage({ params }: Params) {
  const { id } = await params;
  const session = await getSession();
  const role = getUserRole(session?.user);

  return (
    <AssetDetailClient
      assetId={id}
      canMutate={hasMinRole(role, "analyst")}
      canDelete={hasRole(role, ["admin"])}
    />
  );
}
