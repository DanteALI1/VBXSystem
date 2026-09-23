import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted">Обзор активности уязвимостей (каркас W0)</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="text-sm text-muted">CVE сегодня</div>
          <div className="mt-2 font-display text-3xl font-semibold">—</div>
          <Badge className="mt-3" tone="accent">
            ожидается W2/W4
          </Badge>
        </Card>
        <Card>
          <div className="text-sm text-muted">CISA KEV (неделя)</div>
          <div className="mt-2 font-display text-3xl font-semibold">—</div>
          <Badge className="mt-3" tone="warn">
            KEV
          </Badge>
        </Card>
        <Card>
          <div className="text-sm text-muted">Состояние синхронизации</div>
          <div className="mt-2 font-display text-3xl font-semibold">N/A</div>
          <Badge className="mt-3" tone="neutral">
            NVD / BDU
          </Badge>
        </Card>
      </div>
    </div>
  );
}
