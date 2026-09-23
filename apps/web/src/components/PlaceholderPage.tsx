import { Card } from "@/components/ui/Card";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <Card className="border-dashed">
        <p className="text-sm text-muted">Раздел подготовлен в каркасе W0 и будет наполнен в следующих волнах.</p>
      </Card>
    </div>
  );
}
