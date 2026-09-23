import { VulnerabilityDetailView } from "@/components/vulnerabilities/vulnerability-detail-view";

type Props = { params: Promise<{ id: string }> };

export default async function VulnerabilityDetailPage({ params }: Props) {
  const { id } = await params;
  return <VulnerabilityDetailView id={id} />;
}
