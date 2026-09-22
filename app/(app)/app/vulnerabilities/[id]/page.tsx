import { notFound } from "next/navigation";
import { VulnerabilityDetailView } from "@/components/vulnerabilities/vulnerability-detail";
import { requireSession } from "@/lib/auth/session";
import { getVulnerabilityById } from "@/lib/vulnerabilities";

export default async function VulnerabilityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const item = await getVulnerabilityById(id);
  if (!item) notFound();
  return <VulnerabilityDetailView item={item} />;
}
