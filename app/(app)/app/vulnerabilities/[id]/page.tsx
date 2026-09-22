export default async function VulnerabilityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Vulnerability</h1>
      <p className="text-muted-foreground text-sm">id: {id}</p>
    </div>
  );
}
