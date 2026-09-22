import { notFound } from "next/navigation";
import { AssetDetailView } from "@/components/assets/asset-detail";
import { canManageAssets, type AppRole } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { getAssetById } from "@/lib/assets";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const role = (session.user.role ?? "viewer") as AppRole;
  const { id } = await params;
  const asset = await getAssetById(id);
  if (!asset) notFound();

  return (
    <AssetDetailView asset={asset} canWrite={canManageAssets(role)} />
  );
}
